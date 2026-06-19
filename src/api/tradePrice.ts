// 交易估價。
//   - getItemPrice    ：傳奇 / 裝備 → /api/trade/search（name + type）
//   - getCurrencyPrice：通貨 → /api/trade/exchange（want/have）※ 目前暫不從 renderer 使用，保留供日後
// 通貨「絕對不要」走 getItemPrice 的搜尋佇列——兩者限制與查法都不同，務必分開處理。
//
// 為「有效價格」：物品（getItemPrice）納入「該次 search 回傳的全部結果」（分批 fetch 後彙總，
// 不再限制前 10 筆）；通貨（getCurrencyPrice/exchange）仍取前 N 筆。皆以「主流幣別」分別
// 去離群（丟掉 < 中位數 50% 或 > 200% 的雜訊單，如手滑掛錯 / 惡意壓價）→ 取中位數。
// 不做跨幣別換算（通貨兌換比之後再處理）。
//
// 注意：這些端點為「公開」交易資料，免登入即可查詢（實測 search/fetch/exchange 不帶 cookie 也回 200）。
// 若環境變數帶了 session（POE_SESSID / POE_CF_CLEARANCE）會一併附上，但非必要。
import { GET, POST } from "../utility/http.mod";
import { POE_BASE, SEARCH_ENDPOINTS } from "./endpoints";
import { POE_HEADERS } from "./client";
import { RateLimiter } from "./rateLimiter";
import type { PriceListing, PriceQuote } from "../shared/priceQuote";

// 型別事實來源在 src/shared/priceQuote.ts；經 barrel 再匯出以維持既有 import 路徑。
export type { PriceListing, PriceQuote } from "../shared/priceQuote";

// 物品搜尋佇列（trade-search-request-limit，實測值；收到標頭後自動校正）。
const searchLimiter = new RateLimiter([
  { hits: 5, period: 10 },
  { hits: 15, period: 60 },
  { hits: 30, period: 300 },
]);
// fetch 明細佇列（policy 另計，先用保守預設）。
const fetchLimiter = new RateLimiter([
  { hits: 5, period: 10 },
  { hits: 15, period: 60 },
]);
// 通貨兌換佇列（trade-exchange policy，獨立於 search；實測值，收到標頭後自動校正）。
const exchangeLimiter = new RateLimiter([
  { hits: 5, period: 15 },
  { hits: 10, period: 90 },
  { hits: 30, period: 300 },
]);

const SAMPLE = 10; // 通貨 exchange 取線上最便宜的前 N 筆做樣本（物品 search 已改為全量）

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** 去離群（丟掉 < 中位數 50% 或 > 200% 的雜訊）後取中位數；無樣本回 null。 */
function robustMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const med = median(values);
  const kept = values.filter((v) => v >= med * 0.5 && v <= med * 2);
  return median(kept.length > 0 ? kept : values);
}

/** 取指定幣別掛單的去離群中位數（無該幣別掛單回 null）。 */
function medianForCurrency(listings: PriceListing[], currency: string): number | null {
  const amounts = listings.filter((l) => l.currency === currency).map((l) => l.amount);
  return robustMedian(amounts);
}

/**
 * 由掛單清單推估「有效價格」：同一批掛單裡，混沌石與神聖石各別去離群取中位數。
 * 兩種皆無掛單時回 null。
 */
function quoteFrom(listings: PriceListing[]): PriceQuote | null {
  if (listings.length === 0) return null;
  const chaos = medianForCurrency(listings, "chaos");
  const divine = medianForCurrency(listings, "divine");
  if (chaos === null && divine === null) return null;
  return { chaos, divine, fetchedAt: Date.now(), sampleSize: listings.length, listings };
}

/**
 * 交易請求的標頭。免登入即可查詢，所以一律回傳有效標頭；
 * 若環境變數帶了 session 則附上 cookie（非必要，僅備用）。
 */
function tradeHeaders(): Record<string, string> {
  const sid = process.env["POE_SESSID"];
  const cf = process.env["POE_CF_CLEARANCE"];
  const headers: Record<string, string> = {
    ...POE_HEADERS,
    accept: "application/json",
    origin: POE_BASE,
    referer: `${POE_BASE}/trade`,
    "x-requested-with": "XMLHttpRequest",
  };
  const cookie = [cf ? `cf_clearance=${cf}` : "", sid ? `POESESSID=${sid}` : ""]
    .filter(Boolean)
    .join("; ");
  if (cookie) headers["cookie"] = cookie;
  return headers;
}

interface SearchResponse {
  id: string;
  result: string[];
}
interface FetchResponse {
  result: { listing?: { price?: { amount?: number; currency?: string } } }[];
}
interface ExchangeOffer {
  exchange?: { amount?: number; currency?: string };
  item?: { amount?: number; currency?: string };
}
interface ExchangeResponse {
  result: Record<string, { listing?: { offers?: ExchangeOffer[] } }>;
}

/**
 * 取得具名物品（傳奇 / 裝備）的估價。走 search → fetch 兩段式，各自過佇列。
 * @param rarity 帶 "unique" 等可用 type_filters 限定稀有度，避免同名基底混入。
 * @returns 估價（主流幣別中位數 + 取樣掛單）；查無掛單回 null。
 */
export async function getItemPrice(
  league: string,
  name: string,
  type: string,
  rarity?: string,
): Promise<PriceQuote | null> {
  const headers = tradeHeaders();

  // 一律優先「即刻購買」：sale_type=priced 只取有一口價(buyout/fixed)的掛單，排除面議單。
  // 帶 rarity 時再用 type_filters 限定（如 unique），避免同名基底的其他稀有度混入。
  const filters: Record<string, unknown> = {
    trade_filters: { filters: { sale_type: { option: "priced" } } },
  };
  if (rarity) {
    filters["type_filters"] = { filters: { rarity: { option: rarity } } };
  }
  const query = {
    status: { option: "online" },
    name,
    type,
    stats: [{ type: "and", filters: [] }],
    filters,
  };
  const body = { query, sort: { price: "asc" } };
  const search = await searchLimiter.run<SearchResponse>(() =>
    POST(SEARCH_ENDPOINTS.search(league), body, { headers }),
  );
  if (!search.success || !search.data.result?.length) return null;

  // 納入「這一次 search 回傳的全部結果」（不再只取前 10 筆）。
  // fetch 端點每次上限 10 個 id，故把結果清單分批、逐批取明細後彙總；
  // 每批都過 fetchLimiter（多批時會自動排隊/退避以守住 rate limit）。
  const ids = search.data.result;
  const listings: PriceListing[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const fetched = await fetchLimiter.run<FetchResponse>(() =>
      GET(SEARCH_ENDPOINTS.fetch(chunk, search.data.id), { headers }),
    );
    if (!fetched.success) break; // 某批失敗就停，已取得的仍計入估價
    for (const r of fetched.data.result ?? []) {
      const p = r.listing?.price;
      if (!p || p.amount === undefined || !p.currency) continue;
      listings.push({ amount: p.amount, currency: p.currency });
    }
  }
  return quoteFrom(listings);
}

/**
 * 取得通貨的兌換價（暫不從 renderer 使用，保留供日後）。走 exchange 端點，獨立佇列。
 * @returns amount = 1 want 值多少 have（預設混沌石）；查無回 null。
 */
export async function getCurrencyPrice(
  league: string,
  want: string,
  have = "chaos",
): Promise<PriceQuote | null> {
  const headers = tradeHeaders();
  if (want === have) {
    return {
      chaos: have === "chaos" ? 1 : null,
      divine: have === "divine" ? 1 : null,
      fetchedAt: Date.now(),
      sampleSize: 1,
      listings: [],
    };
  }

  const body = {
    query: { status: { option: "online" }, want: [want], have: [have] },
    sort: { have: "asc" },
    engine: "new",
  };
  const res = await exchangeLimiter.run<ExchangeResponse>(() =>
    POST(SEARCH_ENDPOINTS.exchange(league), body, { headers }),
  );
  if (!res.success) return null;

  const listings: PriceListing[] = [];
  for (const entry of Object.values(res.data.result ?? {}).slice(0, SAMPLE)) {
    const offer = entry?.listing?.offers?.[0];
    const wantAmt = offer?.item?.amount;
    const haveAmt = offer?.exchange?.amount;
    if (!wantAmt || !haveAmt) continue;
    listings.push({ amount: haveAmt / wantAmt, currency: have });
  }
  return quoteFrom(listings);
}
