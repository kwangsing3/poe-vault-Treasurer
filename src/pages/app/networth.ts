// 淨資產估值與走勢快照。
// 估值只計「已估價的真實資產」（目前=傳奇，隨估價覆蓋率成長）。不做跨幣別換算：
// 每件物品只歸到其「主流幣別」，分別累加成混沌石總額與神聖石總額（兩條走勢）。
// 每小時對當前聯盟做一次快照，存 localStorage，最多保留 30 天，逾期丟棄。
import { STASH_ITEMS, type StashItem } from './stash';
import { priceOf, dominantPrice } from './prices';

export interface Snapshot {
  t: number; // 時間戳（ms）
  chaos: number; // 當下混沌石總額
  divine: number; // 當下神聖石總額
}

export interface CategoryTotal {
  label: string;
  count: number; // 該類物品數
  priced: number; // 已估價件數
  chaos: number; // 主流為混沌石者的總額
  divine: number; // 主流為神聖石者的總額
}

export interface Valuation {
  chaos: number;
  divine: number;
  pricedItems: number; // 已估價件數
  totalItems: number;
  categories: CategoryTotal[];
}

const HISTORY_KEY = 'poe-networth-history-v1';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 保留 30 天
const SNAPSHOT_INTERVAL = 60 * 60 * 1000; // 每小時一次

const CATEGORY_ORDER = ['傳奇', '通貨', '稀有', '其他'];

function category(it: StashItem): string {
  switch (it.rarity) {
    case 'unique':
      return '傳奇';
    case 'currency':
      return '通貨';
    case 'rare':
      return '稀有';
    default:
      return '其他';
  }
}

/** 依當前快取的估價，計算當下淨資產（分類小計 + 混沌石/神聖石總額）。 */
export function valuation(): Valuation {
  const cats = new Map<string, CategoryTotal>();
  for (const label of CATEGORY_ORDER) {
    cats.set(label, { label, count: 0, priced: 0, chaos: 0, divine: 0 });
  }
  let chaos = 0;
  let divine = 0;
  let pricedItems = 0;
  for (const it of STASH_ITEMS) {
    const c = cats.get(category(it))!;
    c.count++;
    const state = priceOf(it);
    const data = state && state !== 'loading' && state !== 'unknown' ? state : null;
    if (!data) continue;
    const dom = dominantPrice(data);
    if (!dom) continue;
    const total = dom.amount * (it.stack ?? 1);
    if (dom.currency === 'chaos') {
      chaos += total;
      c.chaos += total;
    } else {
      divine += total;
      c.divine += total;
    }
    c.priced++;
    pricedItems++;
  }
  return {
    chaos,
    divine,
    pricedItems,
    totalItems: STASH_ITEMS.length,
    categories: CATEGORY_ORDER.map((l) => cats.get(l)!),
  };
}

// ── 快照歷史（localStorage，依聯盟，最多 30 天）──────────────────────────────
type HistoryStore = Record<string, Snapshot[]>;

function loadHistory(): HistoryStore {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}') as HistoryStore;
  } catch {
    return {};
  }
}
const history: HistoryStore = loadHistory();

function prune(arr: Snapshot[]): Snapshot[] {
  const cutoff = Date.now() - MAX_AGE;
  return arr.filter((s) => s.t >= cutoff);
}
function save(): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* 容量問題：略過 */
  }
}

/** 取某聯盟的快照（已丟棄逾 30 天者）。 */
export function getHistory(league: string): Snapshot[] {
  const arr = prune(history[league] ?? []);
  history[league] = arr;
  return arr;
}

/** 記錄一次快照（距上次未滿 1 小時則略過，除非 force）。 */
export function recordSnapshot(league: string, force = false): void {
  const arr = prune(history[league] ?? []);
  const last = arr[arr.length - 1];
  if (!force && last && Date.now() - last.t < SNAPSHOT_INTERVAL) {
    history[league] = arr;
    return;
  }
  const v = valuation();
  arr.push({ t: Date.now(), chaos: Math.round(v.chaos), divine: Number(v.divine.toFixed(2)) });
  history[league] = prune(arr);
  save();
}

let timer: ReturnType<typeof setInterval> | undefined;
let scheduledLeague = '';

/** 啟動每小時快照排程（切聯盟時更新對象，並立即補一筆「到期」的快照）。 */
export function scheduleSnapshots(league: string): void {
  scheduledLeague = league;
  recordSnapshot(league); // 內含「距上次 ≥ 1 小時」判斷
  if (!timer) {
    timer = setInterval(() => recordSnapshot(scheduledLeague), SNAPSHOT_INTERVAL);
  }
}
