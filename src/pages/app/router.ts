import { formatStashTotal, loadLeagueVault } from "./stash";
import { loadUniquePrices, setPriceResolveHook } from "./prices";
import { scheduleSnapshots } from "./networth";
import { esc } from "./html";
import { initDebugPanel } from "./debugPanel";
import { store, subscribe, update } from "./store";
import { overview } from "./views/overview";
import { search } from "./views/search";
import { report } from "./views/report";
import { settings } from "./views/settings";
import { filter } from "./views/filter";

export interface View {
  render(): string;
  mount?(root: HTMLElement): void;
}

export type Route = "overview" | "search" | "report" | "filter" | "settings";

const NAV: { route: Route; label: string }[] = [
  { route: "overview", label: "總覽" },
  { route: "search", label: "搜尋" },
  { route: "report", label: "報表" },
  { route: "filter", label: "過濾器" },
  { route: "settings", label: "設定" },
];

const routes: Record<Route, View> = {
  overview,
  search,
  report,
  filter,
  settings,
};

function currentRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, "") as Route;
  return hash in routes ? hash : "overview";
}

/** 切換頁面：只改 hash，實際重繪交給 hashchange */
export function navigate(route: Route): void {
  location.hash = `#/${route}`;
}

// 視窗控制鈕圖示（10×10 線稿，currentColor）。
const ICON_MIN =
  '<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1"/></svg>';
const ICON_MAX =
  '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
const ICON_RESTORE =
  '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3 3 V1 H9 V7 H7" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
const ICON_CLOSE =
  '<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1"/></svg>';

// 主題切換鈕圖示：淺色時顯示月亮（點→深色）、深色時顯示太陽（點→淺色）。
const ICON_MOON =
  '<svg width="15" height="15" viewBox="0 0 16 16"><path d="M11 1a6 6 0 1 0 4 10.5A5 5 0 0 1 11 1Z" fill="currentColor"/></svg>';
const ICON_SUN =
  '<svg width="15" height="15" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/><line x1="3" y1="3" x2="4.4" y2="4.4"/><line x1="11.6" y1="11.6" x2="13" y2="13"/><line x1="13" y1="3" x2="11.6" y2="4.4"/><line x1="4.4" y1="11.6" x2="3" y2="13"/></g></svg>';

const THEME_KEY = "poe-theme";
type Theme = "light" | "dark";
function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}
/** 套用主題到 documentElement 並持久化。 */
export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* 隱私模式忽略 */
  }
}
function toggleTheme(): void {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
  render(); // 重繪以更新切換鈕圖示
}

let windowMaximized = false;

function winControls(): string {
  return `
    <div class="winctl">
      <button class="wc" data-win="min" aria-label="最小化" title="最小化">${ICON_MIN}</button>
      <button class="wc" data-win="max" aria-label="最大化" title="最大化">${windowMaximized ? ICON_RESTORE : ICON_MAX}</button>
      <button class="wc wc-close" data-win="close" aria-label="關閉" title="關閉">${ICON_CLOSE}</button>
    </div>`;
}

function topbar(route: Route): string {
  const nav = NAV.map(
    (n) =>
      `<button class="nav-btn ${n.route === route ? "active" : ""}" data-nav="${n.route}">${n.label}</button>`,
  ).join("");

  const leagueOpts = store.leagues
    .map(
      (l) =>
        `<option value="${esc(l)}" ${l === store.league ? "selected" : ""}>${esc(l)}</option>`,
    )
    .join("");

  return `
    <div class="topbar">
      <button class="theme-toggle" data-theme-toggle title="切換深色 / 淺色">${currentTheme() === "dark" ? ICON_SUN : ICON_MOON}</button>
      <div class="glyph"></div>
      <span class="brand">藏 品 庫 · THE RELIQUARY</span>
      <div class="nav">${nav}</div>
      <label class="league">
        <!-- <span class="league-lbl">聯盟</span> -->
        <select id="league-sel" class="league-sel">${leagueOpts}</select>
      </label>
      <div class="asset-pill">
        <span class="lbl">總資產</span>
        <span class="val">${formatStashTotal(store.baseCurrency)}</span>
      </div>
      ${winControls()}
    </div>`;
}

let app: HTMLElement;

function render(): void {
  // 清掉上一個 view 設定的估價更新 hook（避免指向已卸載的 DOM）；需要的 view 會在 mount 重設。
  setPriceResolveHook(null);
  const route = currentRoute();
  app.innerHTML = `${topbar(route)}<div class="content" id="content"></div>`;

  app
    .querySelectorAll<HTMLElement>("[data-nav]")
    .forEach((el) =>
      el.addEventListener("click", () => navigate(el.dataset["nav"] as Route)),
    );

  app
    .querySelector<HTMLSelectElement>("#league-sel")
    ?.addEventListener("change", (e) =>
      switchLeague((e.target as HTMLSelectElement).value),
    );

  app
    .querySelector<HTMLElement>("[data-theme-toggle]")
    ?.addEventListener("click", toggleTheme);

  // 自繪視窗控制鈕
  const winActions: Record<string, () => void> = {
    min: () => window.win?.minimize(),
    max: () => window.win?.maximizeToggle(),
    close: () => window.win?.close(),
  };
  app
    .querySelectorAll<HTMLElement>("[data-win]")
    .forEach((el) =>
      el.addEventListener("click", () => winActions[el.dataset["win"]!]?.()),
    );
  // 雙擊標題列空白處＝切換最大化（補回原生行為）；點到互動元素則略過。
  app
    .querySelector<HTMLElement>(".topbar")
    ?.addEventListener("dblclick", (e) => {
      if (
        !(e.target as HTMLElement).closest(
          ".nav-btn, .league, .asset-pill, .winctl",
        )
      ) {
        window.win?.maximizeToggle();
      }
    });

  const content = app.querySelector<HTMLElement>("#content")!;
  const view = routes[route];
  content.innerHTML = view.render();
  view.mount?.(content);
}

/**
 * 啟動時載入聯盟清單。
 * 未連結帳號 → 抓公用端點（經主進程，避開 CORS）；連結帳號後改優先用 account 資訊（待實作）。
 * 抓取失敗則沿用 store 的離線後備清單。
 */
async function loadLeagues(): Promise<void> {
  const list = await window.poe?.getLeagues();
  if (!list || list.length === 0) return;
  const names = list.map((l) => l.text);
  const prev = store.league;
  update((s) => {
    s.leagues = names;
    if (!names.includes(s.league)) s.league = names[0]!;
  });
  // 若後備聯盟不在即時清單裡而被換掉，載入新預設聯盟的倉庫。
  if (store.league !== prev) syncLeague();
}

/** 啟動時讀取既有 OAuth 登入狀態（token 持久化在主進程）；已登入則更新 store。 */
async function loadAuthStatus(): Promise<void> {
  const s = await window.auth?.status();
  if (!s) return;
  update((st) => {
    st.authConnected = s.connected;
    st.account = s.account ?? null;
  });
}

/** 載入當前聯盟的倉庫（force 時忽略快取重抓），記錄同步時間、重繪，並在背景拉取傳奇估價。 */
export function syncLeague(force = false): void {
  void loadLeagueVault(store.league, force).then(() => {
    store.lastSync = Date.now();
    render();
    // 背景估價：不阻塞 UI，價格陸續寫入快取（無 session 時一律「未知」）。
    loadUniquePrices(store.league);
    // 啟動每小時淨資產快照（用已載入的估價；切聯盟時更新對象）。
    scheduleSnapshots(store.league);
  });
}

/** 切換聯盟：更新狀態並載入該聯盟倉庫（已載入過則用快取），完成後重繪。 */
export function switchLeague(league: string): void {
  update((s) => {
    s.league = league;
    s.searchQuery = "";
  });
  syncLeague();
}

export function start(root: HTMLElement): void {
  app = root;
  app.classList.add("app");
  // 還原使用者主題偏好（預設淺色）。
  try {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved === "dark" ? "dark" : "light");
  } catch {
    /* 隱私模式：維持淺色 */
  }
  window.addEventListener("hashchange", render);
  subscribe(render); // 任何 store 變更都重繪（含 header 的總資產）
  // 視窗最大化狀態：更新最大化鈕的圖示（最大化 ↔ 還原）。
  window.win?.onMaximizeChange((m) => {
    windowMaximized = m;
    const btn = app.querySelector<HTMLElement>('[data-win="max"]');
    if (btn) btn.innerHTML = m ? ICON_RESTORE : ICON_MAX;
  });
  if (!location.hash) location.hash = "#/overview";
  render();
  void initDebugPanel(); // mode=debug 時掛上 API 請求顯示面板
  void loadAuthStatus();
  void loadLeagues();
  // 載入當前聯盟的倉庫物品（透過 API；目前回傳 mock），完成後重繪以填入各頁內容與總資產。
  syncLeague();
}
