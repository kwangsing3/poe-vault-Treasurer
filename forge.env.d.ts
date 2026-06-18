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
  ilvl?: number;
  identified?: boolean;
  implicitMods?: string[];
  explicitMods?: string[];
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
  /**
   * 讀取指定倉庫分頁（預設 0）；可指定聯盟（mock 模式下只有標準模式有資料）。
   * 目前回傳 mock，shape 同真實端點。失敗回傳 null。
   */
  getStash(tabIndex?: number, league?: string): Promise<PoeStashResponse | null>;
  /**
   * 物品估價（傳奇/裝備）：trade search 取線上前 N 筆、去離群取中位數。查無回 null。
   * chaos/divine 為估價（混沌石 / 神聖石），listings 為取樣掛單（詳情頁列表用）。
   */
  getItemPrice(
    league: string,
    name: string,
    type: string,
    rarity?: string,
  ): Promise<PoePriceQuote | null>;
  /**
   * 通貨估價：trade exchange 取兌換比、去離群取中位數。chaos = 1 want 值多少混沌石。查無回 null。
   */
  getCurrencyPrice(
    league: string,
    want: string,
    have?: string,
  ): Promise<PoePriceQuote | null>;
  /** 通貨名稱 → trade code 對照（供 renderer 解析倉庫通貨名）。 */
  getCurrencyCodes(): Promise<Record<string, string>>;
}

interface PoePriceListing {
  amount: number;
  currency: string;
}
interface PoePriceQuote {
  chaos: number | null;
  divine: number | null;
  fetchedAt: number;
  sampleSize: number;
  listings: PoePriceListing[];
}
// 自繪標題列的視窗控制橋接。
interface WinBridge {
  minimize(): void;
  maximizeToggle(): void;
  close(): void;
  /** 視窗最大化狀態變化時回呼（供切換最大化/還原圖示）。 */
  onMaximizeChange(cb: (maximized: boolean) => void): void;
}
interface Window {
  poe: PoeBridge;
  win: WinBridge;
}
