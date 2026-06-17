// trade 靜態資料（通貨等的 名稱↔代碼 對照）。
// 通貨估價需要把倉庫物品的中文名（如「神聖石」）對到 trade 的 currency code（如 "divine"）。
// 來源為 mock/trade-data/static.json（官方 /api/trade/data/static 的快照）。
import { readFileSync } from "node:fs";
import path from "node:path";

interface StaticEntry {
  id: string;
  text: string;
}
interface StaticGroup {
  id: string;
  label: string;
  entries: StaticEntry[];
}
interface StaticResponse {
  result: StaticGroup[];
}

let codeByNameCache: Record<string, string> | null = null;

/**
 * 回傳「物品名稱 → trade currency code」對照表（涵蓋 static 所有群組的 entries）。
 * 找不到對應 code 的通貨即無法用 exchange 估價，呼叫端略過即可。
 */
export function currencyCodeByName(): Record<string, string> {
  if (codeByNameCache) return codeByNameCache;
  const map: Record<string, string> = {};
  try {
    const file = path.join(process.cwd(), "mock", "trade-data", "static.json");
    const data = JSON.parse(readFileSync(file, "utf-8")) as StaticResponse;
    for (const group of data.result ?? []) {
      for (const entry of group.entries ?? []) {
        if (entry.text && entry.id) map[entry.text] = entry.id;
      }
    }
  } catch {
    // 讀不到（例如打包後）→ 回空表，通貨估價一律顯示未知。
  }
  codeByNameCache = map;
  return map;
}
