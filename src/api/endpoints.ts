// 官方台服 PoE API 端點——單一事實來源。
// 所有要跟 GGG 互動的 URL 都集中在此，呼叫函式（見 trade.ts / 未來的 stash.ts）一律引用這裡，
// 不要在別處寫死網址。對照說明見 CLAUDE.md 的「PoE 參考資料」表。

/** 台服站台根網址。 */
export const POE_BASE = "https://pathofexile.tw";

/**
 * trade API 的靜態資料端點（通貨 / 裝備 / 詞綴對照），以及公用聯盟清單。
 * 本地對應 mock 見 `mock/trade-data/`（static/items/stats）。
 */
export const TRADE_ENDPOINTS = {
  /** 公用聯盟清單 → renderer 右上角聯盟切換 */
  leagues: `${POE_BASE}/api/trade/data/leagues`,
  /** 通貨資料 → mock/trade-data/static.json */
  static: `${POE_BASE}/api/trade/data/static`,
  /** 裝備參考 → mock/trade-data/items.json */
  items: `${POE_BASE}/api/trade/data/items`,
  /** 詞綴參考 → mock/trade-data/stats.json（大型 JSON） */
  stats: `${POE_BASE}/api/trade/data/stats`,
} as const;

/**
 * 交易搜尋端點（兩段式）：先 POST search 拿結果 id 清單，再 GET fetch 取實際掛單。
 * 兩者各有獨立的 rate-limit policy（見 rateLimiter.ts），需登入/通過 Cloudflare。
 */
export const SEARCH_ENDPOINTS = {
  /** POST：以查詢條件搜尋掛單，回傳 `{ id, result: string[] }`。需帶 league。 */
  search: (league: string) =>
    `${POE_BASE}/api/trade/search/${encodeURIComponent(league)}`,
  /** GET：依結果 id（最多 10 個，逗號分隔）取掛單明細。需帶 `?query=<searchId>`。 */
  fetch: (ids: string[], searchId: string) =>
    `${POE_BASE}/api/trade/fetch/${ids.join(",")}?query=${searchId}`,
  /**
   * POST：通貨「批量兌換」端點，專供通貨類估價（與物品 search 是不同 policy / 不同佇列）。
   * body 帶 want/have 的 currency code，回傳兌換掛單。
   */
  exchange: (league: string) =>
    `${POE_BASE}/api/trade/exchange/${encodeURIComponent(league)}`,
} as const;

/**
 * 角色 / 倉庫端點。需登入帳號（cookie）後才能取得，目前以 mock/stash 的快照替代。
 * 本地對應 mock 見 `mock/stash/get-stash-items-tab0.json`。
 */
export const STASH_ENDPOINTS = {
  /** 讀取單一 stash tab 的物品（legacy character-window 端點） */
  getStashItems: `${POE_BASE}/character-window/get-stash-items`,
} as const;
