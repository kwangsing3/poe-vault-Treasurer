// OAuth token 的本機持久化。token 屬敏感資料，僅存於主進程、以 Electron safeStorage 加密，
// 不放 renderer / localStorage。safeStorage 不可用時退回明文（仍寫檔，至少跨重啟可用）。
import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // 絕對到期時間（ms）
  account?: string | undefined; // 顯示用帳號名
}

function file(): string {
  return path.join(app.getPath("userData"), "auth.bin");
}

export function saveTokens(t: StoredTokens): void {
  try {
    const json = JSON.stringify(t);
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, "utf8");
    fs.writeFileSync(file(), data);
  } catch {
    /* 寫檔失敗不致命：本次 session 仍可用記憶體中的 token */
  }
}

export function loadTokens(): StoredTokens | null {
  try {
    const f = file();
    if (!fs.existsSync(f)) return null;
    const buf = fs.readFileSync(f);
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString("utf8");
    return JSON.parse(json) as StoredTokens;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  try {
    const f = file();
    if (fs.existsSync(f)) fs.rmSync(f);
  } catch {
    /* ignore */
  }
}
