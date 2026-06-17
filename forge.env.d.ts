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
// get-stash-items 回應（主進程回傳的原始 shape，與 src/api/types.ts 結構一致）。
interface PoeStashTab {
  n: string;
  i: number;
  id: string;
  type: string;
  selected?: boolean;
  colour: { r: number; g: number; b: number };
  srcL?: string;
  srcC?: string;
  srcR?: string;
}
interface PoeStashItem {
  id: string;
  name: string;
  typeLine: string;
  baseType: string;
  icon: string;
  w: number;
  h: number;
  x: number;
  y: number;
  frameType: number;
  stackSize?: number;
  /** 其餘隨物品類型而異的欄位。 */
  [key: string]: unknown;
}
interface PoeStashResponse {
  numTabs: number;
  items: PoeStashItem[];
  /** 完整分頁清單；僅以 tabs=1 請求時回傳（實務上只有 tab 0 帶）。 */
  tabs?: PoeStashTab[];
  /** 被選取分頁是否為 QuadStash；僅普通分頁回傳。 */
  quadLayout?: boolean;
  /** 特殊分頁的格位佈局（currencyLayout 等）。 */
  [layout: string]: unknown;
}
interface PoeBridge {
  /** 抓取公用聯盟清單（主進程代為呼叫，避開 renderer 的 CORS）；失敗回傳 null */
  getLeagues(): Promise<PoeLeague[] | null>;
  /** 讀取指定倉庫分頁（預設 0）；目前回傳 mock，shape 同真實端點。失敗回傳 null */
  getStash(tabIndex?: number): Promise<PoeStashResponse | null>;
}
interface Window {
  poe: PoeBridge;
}
