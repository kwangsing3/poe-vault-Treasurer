// trade API（data/*）的呼叫函式。所有與官方端點互動的入口都收斂在 src/api/ 底下，
// 一律透過 http.mod.ts（內建統一 Result 型別與速率限制），不要在別處直接 fetch GGG。
//
// 這些函式設計在 **main 進程** 執行（Node fetch 無 CORS 限制，日後也方便帶帳號 cookie）；
// renderer 請改走 preload 暴露的 IPC bridge，不要直接 import 此檔。
import { GET } from "../utility/http.mod";
import { POE_HEADERS } from "./client";
import { TRADE_ENDPOINTS } from "./endpoints";
import type { League, LeaguesResponse } from "./types";

/**
 * 抓取公用聯盟清單，供 renderer 右上角的聯盟切換使用。
 * @returns 聯盟陣列；任何失敗（網路 / 非 2xx / 格式不符）一律回傳 `null`，由呼叫端決定後備行為。
 */
export async function fetchLeagues(): Promise<League[] | null> {
  const res = await GET<LeaguesResponse>(TRADE_ENDPOINTS.leagues, {
    headers: POE_HEADERS,
  });
  if (!res.success) return null;
  return Array.isArray(res.data?.result) ? res.data.result : null;
}
