// 群眾外包中央價格指數後台（poe-coco-priceindex）的客戶端 + 詢價派工代行迴圈。
// 契約權威來源：該專案的 TREASURER-INTEGRATION.md。本模組在 main 進程執行，renderer 經 preload IPC 取用。
//
// 兩條路：
//   1) 讀（顯示）：indexQuery → 批次向後台拿聚合最新價（快、且永遠最新），renderer 顯示優先用它。
//   2) 寫（貢獻）：startDispatch 起常駐迴圈「領派工 → 用官方查價 → 回報」，分散各 client 的官方查價負載。
//
// 位址暫寫死本機（localhost:3000）；之後要做成設定時改這裡或加參數即可。
import { GET, POST } from "../utility/http.mod";
import { Sleep } from "../utility/http.mod";
import { getItemPriceDetailed } from "./tradePrice";

/** 指數伺服器位址（暫寫死本機）。 */
const INDEX_BASE = "http://localhost:3000";
const TIMEOUT = 8000;

// ── 對外型別（與 TREASURER-INTEGRATION.md 一致）────────────────────────────────
export interface IndexQueryItem {
  category: "unique" | "card" | "currency";
  name: string;
  baseType?: string;
}
export interface IndexQuote {
  identityKey: string;
  chaos: number | null;
  divine: number | null;
  sampleSize: number;
  confidence?: "high" | "medium" | "low";
  updatedAt?: string | null;
  ageSeconds?: number | null;
  icon?: string;
  /** 查無資料 / 無法定鍵時帶原因（no-data / cannot-normalize…）。 */
  reason?: string;
}
interface Assignment {
  category: "unique" | "card";
  name: string;
  baseType?: string;
  reason: string;
}
interface ReportSample {
  category: "unique" | "card";
  name: string;
  baseType?: string;
  chaos: number | null;
  divine: number | null;
  sampleSize: number;
  observedAt: string;
  icon?: string;
}

const BATCH = 300; // 每批查詢上限（後台無硬限，建議 ≤200–500，延遲低好重試）

/**
 * 批次向後台詢價。結果順序對齊 items；後台離線 / 失敗回 null（呼叫端據此 fallback 官方查價）。
 * 自動分批並串接，維持與輸入相同順序。
 */
export async function indexQuery(
  league: string,
  items: IndexQueryItem[],
): Promise<IndexQuote[] | null> {
  if (items.length === 0) return [];
  const out: IndexQuote[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const res = await POST<{ results: IndexQuote[] }>(
      `${INDEX_BASE}/v1/prices/query`,
      { league, items: batch },
      { throttle: false, timeout: TIMEOUT },
    );
    if (!res.success) return null; // 任一批失敗即視為整體不可用 → 全部 fallback 官方
    out.push(...(res.data.results ?? []));
  }
  return out;
}

/** 領取詢價派工（只會派 unique / card）。失敗回 null。 */
async function indexWork(
  reporterId: string,
  league: string,
  max: number,
): Promise<{ assignments: Assignment[]; leaseSeconds: number } | null> {
  const res = await GET<{ assignments: Assignment[]; leaseSeconds: number }>(
    `${INDEX_BASE}/v1/work/next`,
    { params: { reporterId, league, max }, throttle: false, timeout: TIMEOUT },
  );
  if (!res.success) return null;
  return res.data;
}

/** 回報查價結果（自動釋放對應派工租約）。回傳是否成功。 */
async function indexReport(
  reporterId: string,
  league: string,
  samples: ReportSample[],
  officialHeaders?: Record<string, string>,
): Promise<boolean> {
  const body: Record<string, unknown> = { reporterId, league, samples };
  if (officialHeaders) body["officialHeaders"] = officialHeaders;
  const res = await POST(`${INDEX_BASE}/v1/prices/report`, body, {
    throttle: false,
    timeout: TIMEOUT,
  });
  return res.success;
}

// ── 派工代行迴圈 ───────────────────────────────────────────────────────────────
// gen 作為「世代」：每次 start/stop +1，正在跑的迴圈發現 gen 變了就自行退出（切聯盟 / 關閉貢獻時乾淨收尾）。
let gen = 0;

/** 對一批派工逐筆查官方並回報。回傳本輪實際回報筆數。 */
async function runOnce(reporterId: string, league: string, myGen: number): Promise<number> {
  const work = await indexWork(reporterId, league, 10);
  if (!work || work.assignments.length === 0) return 0;

  const samples: ReportSample[] = [];
  let headers: Record<string, string> | undefined;
  for (const a of work.assignments) {
    if (gen !== myGen) break; // 中途被切聯盟 / 停用：放棄剩餘（租約逾時後會自動回收）
    // unique：name + baseType + rarity 限定；card：只用 type=卡名（name 留空）。
    const isUnique = a.category === "unique";
    const d = await getItemPriceDetailed(
      league,
      isUnique ? a.name : "",
      isUnique ? a.baseType ?? a.name : a.name,
      isUnique ? "unique" : undefined,
    );
    if (!d.quote) continue; // 查無 → 不回報該筆（租約逾時後自然釋放）
    // 只取「實際產出回報樣本」那次官方查價的信任標頭，並覆蓋成最新一筆
    // （date 最新利於後台新鮮度檢核）；確保回報帶的 header 對應到真的送出的官方請求。
    if (d.officialHeaders) headers = d.officialHeaders;
    const s: ReportSample = {
      category: a.category,
      name: a.name,
      chaos: d.quote.chaos,
      divine: d.quote.divine,
      sampleSize: d.quote.sampleSize,
      observedAt: new Date().toISOString(),
    };
    if (a.baseType !== undefined) s.baseType = a.baseType;
    if (d.icon) s.icon = d.icon;
    samples.push(s);
  }
  if (samples.length === 0 || gen !== myGen) return 0;
  // 信任憑證：一律帶官方回傳的 header（policy / ip-state / cf-ray / date…）給後台做格式與新鮮度檢核。
  // 正常情況下只要有樣本就必有 header（search 成功才會有 quote）；極端情況缺漏時記一筆警告但仍照常回報。
  if (!headers) console.warn("[priceIndex] 回報缺少官方 header（信任憑證），仍照常送出");
  await indexReport(reporterId, league, samples, headers);
  return samples.length;
}

/** 常駐迴圈：有工就做（短歇）、沒工 / 失敗就拉長間隔，避免空轉狂打後台。 */
async function loop(reporterId: string, league: string, myGen: number): Promise<void> {
  while (gen === myGen) {
    let done = 0;
    try {
      done = await runOnce(reporterId, league, myGen);
    } catch {
      done = 0;
    }
    if (gen !== myGen) break;
    await Sleep(done > 0 ? 1500 : 15000);
  }
}

/**
 * 啟動派工代行（會先停掉前一個迴圈）。renderer 在啟用貢獻 + 切聯盟時呼叫。
 * 官方查價的速率由 tradePrice 的 searchLimiter（含使用者上限）統一管控，不會超量。
 */
export function startDispatch(reporterId: string, league: string): void {
  gen++;
  const myGen = gen;
  void loop(reporterId, league, myGen);
}

/** 停止派工代行（停用貢獻 / 關閉時呼叫）。 */
export function stopDispatch(): void {
  gen++;
}
