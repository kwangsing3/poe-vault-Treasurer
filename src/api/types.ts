// 官方 API 回應的型別。只描述我們實際會用到的欄位，其餘以 index signature 容納。
// 注意：renderer 端透過 preload bridge 看到的型別另外宣告在 forge.env.d.ts（PoeLeague），
// 兩者結構一致但分屬不同層級（main 進程 API 型別 vs. 跨進程 bridge 契約），刻意不互相依賴。

/** 單一聯盟。對應 `/api/trade/data/leagues` 的 `result[]` 元素。 */
export interface League {
  id: string;
  realm: string;
  text: string;
}

/** `/api/trade/data/leagues` 的回應外層。 */
export interface LeaguesResponse {
  result: League[];
}

/** 物品屬性列（`properties` 元素）。`values` 為 `[文字, 顯示類型]` 配對。 */
export interface StashItemProperty {
  name: string;
  values: [string, number][];
  displayMode?: number;
  type?: number;
}

/**
 * 單一倉庫物品。對應 `get-stash-items` 回應的 `items[]` 元素。
 * 只明列我們會用到的欄位；GGG 依物品類型還會帶其他欄位（sockets / socketedItems 等），
 * 以 index signature 原樣保留，方便日後解析。
 */
export interface StashApiItem {
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
  frameTypeId?: string;
  ilvl?: number;
  identified?: boolean;
  verified?: boolean;
  league?: string;
  inventoryId?: string;
  stackSize?: number;
  maxStackSize?: number;
  properties?: StashItemProperty[];
  explicitMods?: string[];
  implicitMods?: string[];
  descrText?: string;
  /** 其餘隨物品類型而異的欄位，原樣保留。 */
  [key: string]: unknown;
}

/** 分頁中繼資料。對應 `get-stash-items` 回應的 `tabs[]` 元素。 */
export interface StashApiTab {
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

/**
 * `get-stash-items` 的回應外層。
 * 注意：`tabs` 與 `quadLayout` 只在以 `tabs=1` 請求時回傳（實務上只有抓 tab 0 時帶）；
 * 其他分頁改帶各自類型的佈局欄位（`currencyLayout` / `fragmentLayout` / `uniqueLayout`…），
 * 以 index signature 原樣保留。
 */
export interface GetStashItemsResponse {
  numTabs: number;
  items: StashApiItem[];
  /** 完整分頁清單；僅以 tabs=1 請求時回傳。 */
  tabs?: StashApiTab[];
  /** 被選取分頁是否為 24×24 大倉（QuadStash）；僅普通分頁回傳。 */
  quadLayout?: boolean;
  /** 特殊分頁的格位佈局（currencyLayout 等），結構依分頁類型而異。 */
  [layout: string]: unknown;
}
