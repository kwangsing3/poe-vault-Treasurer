// Globals injected by @electron-forge/plugin-vite at build time.
// Declared explicitly (instead of /// <reference .../forge-vite-env />) so the
// type-check doesn't pull the plugin's own .ts sources into the program.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// 主進程透過 preload 暴露的橋接 API（IPC）。
interface PoeLeague {
  id: string;
  realm: string;
  text: string;
}
interface PoeBridge {
  /** 抓取公用聯盟清單（主進程代為呼叫，避開 renderer 的 CORS）；失敗回傳 null */
  getLeagues(): Promise<PoeLeague[] | null>;
}
interface Window {
  poe: PoeBridge;
}
