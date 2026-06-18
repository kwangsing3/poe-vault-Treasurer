// Public client OAuth 2.1（Authorization Code + PKCE）。
// 桌面 app 無法安全保存 client secret，依官方規範必須走 PKCE + loopback redirect。
// 整段流程只在主進程執行；token 交給 tokenStore 加密持久化，access token 不外流到 renderer。
import crypto from "node:crypto";
import http from "node:http";
import { shell } from "electron";
import { POE_HEADERS } from "./client";
import { clearTokens, loadTokens, saveTokens, type StoredTokens } from "./tokenStore";

// ── 設定（依實際註冊值調整）──────────────────────────────────────────────
// client_id 走環境變數，不寫死進 repo；port 為固定值，須與開發者後台註冊的 redirect_uri 一致。
const CLIENT_ID = process.env["POE_CLIENT_ID"] ?? "";
const PORT = 52847;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = "account:profile account:stashes";
// OAuth / API 端點網域：預設台服，可用環境變數覆寫（國際服改 pathofexile.com / api.pathofexile.com）。
const OAUTH_BASE = process.env["POE_OAUTH_BASE"] ?? "https://pathofexile.tw";
const API_BASE = process.env["POE_API_BASE"] ?? "https://api.pathofexile.tw";
const AUTHORIZE_URL = `${OAUTH_BASE}/oauth/authorize`;
const TOKEN_URL = `${OAUTH_BASE}/oauth/token`;

export interface AuthStatus {
  connected: boolean;
  account?: string | undefined;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 記憶體中的 token（首次存取時從加密檔載入）。
let tokens: StoredTokens | null = null;
let loaded = false;
function ensureLoaded(): void {
  if (!loaded) {
    tokens = loadTokens();
    loaded = true;
  }
}

export function getStatus(): AuthStatus {
  ensureLoaded();
  return tokens ? { connected: true, account: tokens.account } : { connected: false };
}

export function logout(): void {
  tokens = null;
  loaded = true;
  clearTokens();
}

let loginInFlight = false;

/** 啟動登入：開系統瀏覽器授權、loopback 收 code、換 token、取帳號名。 */
export async function login(): Promise<AuthStatus> {
  if (!CLIENT_ID) throw new Error("尚未設定 POE_CLIENT_ID 環境變數");
  if (loginInFlight) throw new Error("登入已在進行中");
  loginInFlight = true;
  try {
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
    const state = base64url(crypto.randomBytes(16));

    const authorizeUrl =
      `${AUTHORIZE_URL}?` +
      new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        scope: SCOPE,
        state,
        redirect_uri: REDIRECT_URI,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();

    // 先架好 loopback server 再開瀏覽器，避免 redirect 比 server 早到。
    const codePromise = waitForCallback(state);
    await shell.openExternal(authorizeUrl);
    const code = await codePromise;

    const resp = await postToken({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    const account = await fetchAccount(resp.access_token);
    store(resp, account);
    return { connected: true, account };
  } finally {
    loginInFlight = false;
  }
}

/**
 * 取得有效 access token；快過期時用 refresh token 換新。未登入回 null。
 * 供 Phase 2 的真實 stash 呼叫使用。
 */
export async function getAccessToken(): Promise<string | null> {
  ensureLoaded();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;
  try {
    const resp = await postToken({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: tokens.refreshToken,
    });
    store(resp, tokens.account);
    return tokens.accessToken;
  } catch {
    return tokens.accessToken; // 刷新失敗：先回舊 token，由呼叫端處理 401
  }
}

// ── 內部 ────────────────────────────────────────────────────────────────

/** 等待 loopback callback 取授權碼；單次性、5 分鐘逾時。 */
function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(resultPage(!error && !!code));
      cleanup();
      if (error) reject(new Error(`授權被拒：${error}`));
      else if (state !== expectedState) reject(new Error("state 不符，疑似 CSRF，已中止"));
      else if (code) resolve(code);
      else reject(new Error("回呼缺少授權碼"));
    });
    const timer = setTimeout(
      () => {
        cleanup();
        reject(new Error("登入逾時（5 分鐘未完成授權）"));
      },
      5 * 60 * 1000,
    );
    const cleanup = () => {
      clearTimeout(timer);
      server.close();
    };
    server.on("error", (e) => {
      clearTimeout(timer);
      reject(
        (e as NodeJS.ErrnoException).code === "EADDRINUSE"
          ? new Error(`連接埠 ${PORT} 已被占用，無法完成登入`)
          : e,
      );
    });
    server.listen(PORT, "127.0.0.1");
  });
}

function resultPage(ok: boolean): string {
  const msg = ok ? "登入成功，請回到「藏品庫」應用程式。" : "登入失敗，請重試。";
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#d9d7d2;color:#2b2a27;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-weight:600">${msg}</h2><p style="color:#6c6962">可以關閉此分頁。</p></div></body></html>`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { ...POE_HEADERS, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`token 交換失敗：HTTP ${res.status}`);
  return (await res.json()) as TokenResponse;
}

async function fetchAccount(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${API_BASE}/profile`, {
      headers: { ...POE_HEADERS, authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { name?: string };
    return data.name;
  } catch {
    return undefined;
  }
}

function store(resp: TokenResponse, account: string | undefined): void {
  tokens = {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token,
    expiresAt: Date.now() + resp.expires_in * 1000,
    account,
  };
  loaded = true;
  saveTokens(tokens);
}
