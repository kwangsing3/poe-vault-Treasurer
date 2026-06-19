// 詢價佇列（trade search/fetch/exchange）的請求診斷記錄。
// 僅 debug 模式由 main.ts 接上；把每筆 trade 請求以 JSONL 追加到 price-queue.log，
// 含回應的 x-rate-limit-* 與 retry-after，供事後分析為何撞到 rate limit。
import fs from "node:fs";
import path from "node:path";
import type { ApiCallRecord } from "../utility/http.mod";

const LOG_PATH = path.join(process.cwd(), "price-queue.log");

export function apiLogPath(): string {
  return LOG_PATH;
}

/** 清空既有記錄（每次啟動 debug 記錄前呼叫，避免混入上次資料）。 */
export function resetApiLog(): void {
  try {
    fs.writeFileSync(LOG_PATH, "");
  } catch {
    /* 忽略 */
  }
}

/** 追加一筆 trade 查價請求紀錄（JSONL）。非 trade 端點略過（只關心詢價佇列）。 */
export function logApiCall(rec: ApiCallRecord): void {
  if (!rec.url.includes("/api/trade/")) return;
  let p = rec.url;
  try {
    p = new URL(rec.url).pathname;
  } catch {
    /* 保留原字串 */
  }
  // 從 request body 取出查詢的 name/type（診斷哪些物品 400）。
  let name: unknown;
  let type: unknown;
  try {
    const b = JSON.parse(rec.body ?? "") as { query?: { name?: unknown; type?: unknown } };
    name = b.query?.name;
    type = b.query?.type;
  } catch {
    /* 非 JSON body（如 fetch GET）→ 無 name/type */
  }
  const line = JSON.stringify({
    time: new Date(rec.t).toISOString(),
    method: rec.method,
    path: p,
    ...(name !== undefined ? { name } : {}),
    ...(type !== undefined ? { type } : {}),
    status: rec.status,
    ms: rec.ms,
    ...(rec.detail ? { detail: rec.detail } : {}),
    rl: rec.rateLimit ?? {},
  });
  try {
    fs.appendFileSync(LOG_PATH, line + "\n");
  } catch {
    /* 寫檔失敗不致命 */
  }
}
