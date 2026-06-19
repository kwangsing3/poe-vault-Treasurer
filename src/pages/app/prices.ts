// 傳奇裝備估價（背景拉取 + 本地持久化）。走 window.poe.getItemPrice（trade search）。
// 估價為「主流幣別去離群後的中位數」，並保留取樣掛單清單供詳情頁列表顯示；有價時帶拉取時間。
// 價格依聯盟存進 localStorage，開啟時先載入（不再空白）；過期者重新排入查價佇列。
// 通貨（兌換比）暫不處理，之後再做；目前只估傳奇物品。
import { STASH_ITEMS, type StashItem } from './stash';
import currencyMetaRaw from './currency-meta.json';

// 通貨代碼 → { 繁中名, 圖示URL }（由 scripts/build-currency-meta.mjs 從 trade static 萃取）。
const currencyMeta = currencyMetaRaw as Record<string, { zh: string; icon: string }>;

/** 價格新鮮度門檻：超過此時間（1 小時）視為過期，會重新排入查價佇列。 */
const PRICE_TTL = 60 * 60 * 1000; // 1 小時
const STORE_KEY = 'poe-price-cache-v1';

export interface PriceListing {
  amount: number;
  currency: string;
}

export interface PriceData {
  chaos: number | null; // 混沌石中位數估價（無混沌石掛單則 null）
  divine: number | null; // 神聖石中位數估價（無神聖石掛單則 null）
  fetchedAt: number; // 拉取時間（ms）
  sampleSize: number; // 取樣掛單總數
  listings: PriceListing[]; // 取樣掛單（詳情頁列表）
}

/** 估價狀態：未拉取(undefined) / 拉取中 / 未知（查無） / 有價。 */
export type PriceState = 'loading' | 'unknown' | PriceData;

// in-memory 快取：當前聯盟的 key → 狀態（供 view 即時查詢）。
const cache = new Map<string, PriceState>();

// 本地持久化：聯盟 → (key → 已存的有效價格)。只存實際有價的 PriceData。
type PersistedStore = Record<string, Record<string, PriceData>>;

function loadPersisted(): PersistedStore {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as PersistedStore;
  } catch {
    return {};
  }
}
const persisted: PersistedStore = loadPersisted();

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function savePersistedSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(persisted));
    } catch {
      /* 容量滿等情況：略過，不影響執行 */
    }
  }, 500);
}

function isFresh(d: PriceData): boolean {
  return Date.now() - d.fetchedAt < PRICE_TTL;
}

/** 以名稱 + 基底為 key。 */
export function keyOf(name: string, base: string | undefined): string {
  return `${name}|${base ?? ''}`;
}
export function priceKey(it: StashItem): string {
  return keyOf(it.name, it.base);
}
export function priceOf(it: StashItem): PriceState | undefined {
  return cache.get(priceKey(it));
}
export function priceStateFor(name: string, base: string | undefined): PriceState | undefined {
  return cache.get(keyOf(name, base));
}

// 單一通知 hook：由當前掛載的 view 設定，估價更新時呼叫（傳入該 key）。
let resolveHook: ((key: string) => void) | null = null;
export function setPriceResolveHook(fn: ((key: string) => void) | null): void {
  resolveHook = fn;
}

// ── 查價佇列（單一 worker 依序消化；支援插隊到最前）──────────────────────────
interface QueueItem {
  key: string;
  name: string;
  base: string;
}
let queue: QueueItem[] = [];
const queued = new Set<string>(); // 在佇列中的 key（避免重複排入）
let working = false;
let activeLeague = '';
let activeRun = 0; // 切聯盟時 +1，作廢進行中的結果

/** 排入查價。front=true 時插到最前（使用者主動查價用）。 */
function enqueue(name: string, base: string, front: boolean): void {
  const key = keyOf(name, base);
  if (queued.has(key)) {
    if (front) {
      queue = queue.filter((q) => q.key !== key);
      queue.unshift({ key, name, base });
    }
    return;
  }
  queued.add(key);
  const item = { key, name, base };
  if (front) queue.unshift(item);
  else queue.push(item);
}

/** 啟動 worker（已在運作則不重複啟動）。 */
function kick(): void {
  if (!working) void worker();
}

/** 單一 worker：依序從佇列前端取出查價，過期者保留舊價直到新價回來。 */
async function worker(): Promise<void> {
  working = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const league = activeLeague;
      const run = activeRun;
      if (cache.get(item.key) === undefined) {
        cache.set(item.key, 'loading');
        resolveHook?.(item.key);
      }
      const q = await window.poe?.getItemPrice(league, item.name, item.base, 'unique');
      queued.delete(item.key);
      if (run !== activeRun) continue; // 已切聯盟：結果作廢，但繼續消化新佇列
      if (q) {
        cache.set(item.key, q);
        (persisted[league] ??= {})[item.key] = q;
        savePersistedSoon();
      } else if (cache.get(item.key) === 'loading') {
        cache.set(item.key, 'unknown');
      }
      resolveHook?.(item.key);
    }
  } finally {
    working = false;
  }
}

/**
 * 載入並背景估價當前聯盟的傳奇物品。
 * 先用 localStorage 既有價格填滿快取（開啟即有資料、不空白），
 * 再把「沒有」或「已過期」的排入佇列；新價格寫回 localStorage。
 */
export function loadUniquePrices(league: string): void {
  activeRun++; // 作廢前一聯盟進行中的結果
  activeLeague = league;
  queue = [];
  queued.clear();

  // 載入該聯盟已存價格到快取（切聯盟時換成該聯盟的）。
  cache.clear();
  for (const [key, data] of Object.entries(persisted[league] ?? {})) cache.set(key, data);

  // 排入需要查價的傳奇：尚無價格、或既有價格已過期。
  const seen = new Set<string>();
  for (const it of STASH_ITEMS) {
    if (it.rarity !== 'unique') continue; // 只估傳奇；通貨等之後再處理
    const key = priceKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    const cached = cache.get(key);
    const fresh = cached !== undefined && cached !== 'loading' && cached !== 'unknown' && isFresh(cached);
    if (!fresh) enqueue(it.name, it.base, false);
  }
  kick();
}

/** 使用者主動查價：插到佇列最前、立即啟動 worker（即使已有新鮮價也重查並覆蓋）。 */
export function requestPrice(name: string, base: string | undefined): void {
  enqueue(name, base ?? '', true);
  kick();
}

const CURRENCY_LABEL: Record<string, string> = {
  divine: 'div',
  chaos: 'c',
  exalted: 'e',
};

/** 幣別代碼 → 顯示單位（未知代碼原樣顯示）。 */
export function currencyUnit(code: string): string {
  return CURRENCY_LABEL[code] ?? code;
}

/** 幣別代碼 → 繁中名（未知退回 currencyUnit）。 */
export function currencyName(code: string): string {
  return currencyMeta[code]?.zh ?? currencyUnit(code);
}
/** 幣別代碼 → 圖示 URL（未知回 undefined）。 */
export function currencyIcon(code: string): string | undefined {
  return currencyMeta[code]?.icon;
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 單一標價 →「數量 x [圖示] 中文幣名」的 HTML 片段（如 24x[圖]混沌石）。 */
export function priceTagHTML(amount: number, currency: string): string {
  const icon = currencyIcon(currency);
  const img = icon ? `<img class="cur-ico" src="${icon}" alt="" loading="lazy" />` : '';
  return `<span class="price-tag">${num(amount)}x${img}${currencyName(currency)}</span>`;
}

/** 把估價狀態格式化成單行字串（混沌石 + 神聖石並列；含相對拉取時間）。 */
export function formatPrice(state: PriceState | undefined): string {
  if (state === undefined || state === 'loading') return '查價中…';
  if (state === 'unknown') return '未知';
  const parts: string[] = [];
  if (state.divine !== null) parts.push(`${num(state.divine)} div`);
  if (state.chaos !== null) parts.push(`${num(state.chaos)} c`);
  if (parts.length === 0) return '未知';
  return `${parts.join(' / ')} · ${relativeTime(state.fetchedAt)}`;
}

/**
 * 多行估價 HTML：神聖石在上、混沌石在下，各自一行；下方附相對拉取時間。
 * loading / unknown 回單行文字。
 */
export function priceLinesHTML(state: PriceState | undefined): string {
  if (state === undefined || state === 'loading') return '查價中…';
  if (state === 'unknown') return '未知';
  const lines: string[] = [];
  if (state.divine !== null) lines.push(priceTagHTML(state.divine, 'divine'));
  if (state.chaos !== null) lines.push(priceTagHTML(state.chaos, 'chaos'));
  if (lines.length === 0) return '未知';
  const rows = lines
    .map((l) => `<span style="display:block;line-height:1.6;">${l}</span>`)
    .join('');
  return `${rows}<span style="display:block;color:var(--muted-2);font:500 11px/1.4 var(--sans);">${relativeTime(state.fetchedAt)}</span>`;
}

/**
 * 取一件物品的「主流幣別」單價：掛單較多的幣別（chaos / divine），用於加總而不重複計入兩邊。
 * 兩種皆無則回 null。
 */
export function dominantPrice(d: PriceData): { currency: 'chaos' | 'divine'; amount: number } | null {
  let chaosCount = 0;
  let divineCount = 0;
  for (const l of d.listings) {
    if (l.currency === 'chaos') chaosCount++;
    else if (l.currency === 'divine') divineCount++;
  }
  const preferDivine = divineCount > chaosCount;
  if (preferDivine && d.divine !== null) return { currency: 'divine', amount: d.divine };
  if (!preferDivine && d.chaos !== null) return { currency: 'chaos', amount: d.chaos };
  if (d.chaos !== null) return { currency: 'chaos', amount: d.chaos };
  if (d.divine !== null) return { currency: 'divine', amount: d.divine };
  return null;
}

/** 把單筆掛單格式化（原始幣別）。 */
export function formatListing(l: PriceListing): string {
  const amt = Number.isInteger(l.amount) ? l.amount : l.amount.toFixed(1);
  return `${amt} ${currencyUnit(l.currency)}`;
}

function relativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return '剛剛';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}
