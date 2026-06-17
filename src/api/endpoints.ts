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
 * 角色 / 倉庫端點。需登入帳號（cookie）後才能取得，目前以 mock/stash 的快照替代。
 * 本地對應 mock 見 `mock/stash/get-stash-items-tab0.json`。
 */
export const STASH_ENDPOINTS = {
  /** 讀取單一 stash tab 的物品（legacy character-window 端點） */
  getStashItems: `${POE_BASE}/character-window/get-stash-items`,
} as const;
