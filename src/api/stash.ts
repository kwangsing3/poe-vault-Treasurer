// 倉庫（character-window/get-stash-items）的呼叫函式。與其他 api/ 模組一樣設計在 **main 進程**
// 執行（Node fetch 無 CORS 限制，且能帶 POESESSID / cf_clearance cookie）；renderer 走 preload IPC。
//
// 目前尚未串接真正的帳號連結，因此一律回傳 mock：mock/stash/get-stash-items-tab{N}.json，
// 即真實端點對每一分頁的原始回應（標準模式聯盟，36 頁）。串好帳號後把 USE_MOCK 改成 false，
// 即走真實請求分支，回傳型別不變、呼叫端零改動。
import { readFileSync } from "node:fs";
import path from "node:path";
import { GET } from "../utility/http.mod";
import { POE_HEADERS } from "./client";
import { STASH_ENDPOINTS } from "./endpoints";
import type { GetStashItemsResponse } from "./types";

/** 尚未串接真正帳號連結前一律回傳 mock。串好後改為 false。 */
const USE_MOCK = true;

/** mock 快照所屬的聯盟。mock 模式下只有這個聯盟有資料，其他聯盟回空（模擬多聯盟切換）。 */
const MOCK_LEAGUE = "標準模式";

/** 帳號相關選項。mock 模式用不到；真實模式才需要。 */
export interface GetStashOptions {
  accountName?: string | undefined;
  realm?: string | undefined;
  league?: string | undefined;
  /** 是否一併回傳分頁清單（對應端點的 tabs=1）。預設 false（只有抓 tab 0 時才需要 true）。 */
  withTabs?: boolean | undefined;
  /** 帳號 session（POESESSID）。連同 cf_clearance 一起以 Cookie 標頭送出。 */
  sessionId?: string | undefined;
}

/**
 * 讀取指定倉庫分頁的物品。這是取得單一分頁內容的主要入口。
 * @param tabIndex 分頁索引（0 起算）
 * @param options 帳號相關選項（mock 模式下忽略）
 * @returns 原始 `get-stash-items` 回應；任何失敗一律回傳 `null`，由呼叫端決定後備行為。
 */
export async function getStashByTab(
  tabIndex: number,
  options: GetStashOptions = {},
): Promise<GetStashItemsResponse | null> {
  if (USE_MOCK) {
    // mock 只代表 MOCK_LEAGUE；指定其他聯盟時回傳空分頁，模擬「該聯盟尚無資料」。
    if (options.league && options.league !== MOCK_LEAGUE) {
      return { numTabs: 0, items: [] };
    }
    return readMockTab(tabIndex);
  }

  // ── 真實端點（需 POESESSID + cf_clearance cookie，於主進程送出避開 CORS）──
  const res = await GET<GetStashItemsResponse>(STASH_ENDPOINTS.getStashItems, {
    params: {
      accountName: options.accountName,
      realm: options.realm,
      league: options.league,
      tabs: options.withTabs ? 1 : 0,
      tabIndex,
    },
    headers: options.sessionId
      ? { ...POE_HEADERS, cookie: `POESESSID=${options.sessionId}` }
      : POE_HEADERS,
  });
  return res.success ? res.data : null;
}

// ── mock 資料源 ──────────────────────────────────────────────────────────

const mockCache = new Map<number, GetStashItemsResponse | null>();

/**
 * 讀取 mock/stash/get-stash-items-tab{N}.json（真實端點對該分頁的原始快照）。
 * 僅供開發期使用：以 cwd 解析（`npm start` 時為專案根）；檔案不存在則回傳 null。
 * 註：只有 tab 0 的快照帶完整 `tabs` 分頁清單與 `quadLayout`，其餘分頁只有自身 items 與佈局。
 */
function readMockTab(tabIndex: number): GetStashItemsResponse | null {
  const cached = mockCache.get(tabIndex);
  if (cached !== undefined) return cached;

  let result: GetStashItemsResponse | null;
  try {
    const file = path.join(
      process.cwd(),
      "mock",
      "stash",
      `get-stash-items-tab${tabIndex}.json`,
    );
    result = JSON.parse(readFileSync(file, "utf-8")) as GetStashItemsResponse;
  } catch {
    result = null;
  }
  mockCache.set(tabIndex, result);
  return result;
}
