// 倉庫資料：分頁中繼資料（STASH_TABS）為固定值；物品（STASH_ITEMS）於啟動時透過
// preload 暴露的 window.poe.getStash(tabIndex) 逐頁載入（目前主進程回傳 mock，shape 同真實端點）。
// 由 router 在啟動時呼叫 loadLeagueVault() 填入後重繪；估值(value)仍為 mock。
import { CURRENCY_META, type BaseCurrency, type Rarity } from './data';

export const QUAD_SIZE = 24;
export const NORMAL_SIZE = 12;

export interface StashTab {
  i: number;
  n: string;
  type: string;
  r: number; g: number; b: number;
  quad: boolean;
}

export interface StashItem {
  id: string;
  tab: number;
  name: string;
  base: string;
  rarity: Rarity;
  frame: number;
  value: number; // mock 價值（混沌石 c）
  stack?: number; // 堆疊數（真實）
  icon: string;
  x: number; y: number; w: number; h: number; // 網格分頁＝格座標；特殊分頁＝x 為 slot 索引
  ilvl?: number; // 物品等級（真實）
  mods?: string[]; // 詞綴（implicit + explicit，真實）
}

// 特殊分頁（通貨/碎片/精華…）的固定版面：回應內附的 *Layout 物件。
// slot 以像素座標定位（x/y），w/h 為格數、scale 為縮放；物品的 x 即此 slot 的索引。
// 部分版面分多個 section（子頁），各 section 座標獨立，需切換顯示。
export interface LayoutSlot {
  section?: string | undefined;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}
export interface StashLayout {
  sections: string[]; // 子頁順序（無分區時為空陣列）
  slots: Record<string, LayoutSlot>; // slot 索引 → 位置
}

export const STASH_TABS: StashTab[] = [
  {"i":0,"n":"巨","type":"QuadStash","r":240,"g":255,"b":128,"quad":true},
  {"i":1,"n":"通貨","type":"CurrencyStash","r":221,"g":221,"b":221,"quad":false},
  {"i":2,"n":"12","type":"MapStash","r":128,"g":179,"b":255,"quad":false},
  {"i":3,"n":"特","type":"FragmentStash","r":191,"g":0,"b":0,"quad":false},
  {"i":4,"n":"精隨","type":"EssenceStash","r":204,"g":0,"b":154,"quad":false},
  {"i":5,"n":"譫妄","type":"DeliriumStash","r":221,"g":221,"b":221,"quad":false},
  {"i":6,"n":"通牒","type":"UltimatumStash","r":115,"g":0,"b":85,"quad":false},
  {"i":7,"n":"卡","type":"DivinationCardStash","r":192,"g":128,"b":255,"quad":false},
  {"i":8,"n":"凋落","type":"BlightStash","r":255,"g":170,"b":0,"quad":false},
  {"i":9,"n":"化石","type":"DelveStash","r":191,"g":94,"b":0,"quad":false},
  {"i":10,"n":"1","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":11,"n":"2","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":12,"n":"3","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":13,"n":"4","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":14,"n":"5","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":15,"n":"6","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":16,"n":"傳奇","type":"UniqueStash","r":191,"g":94,"b":0,"quad":false},
  {"i":17,"n":"技能","type":"GemStash","r":0,"g":191,"b":0,"quad":false},
  {"i":18,"n":"藥水博物館","type":"FlaskStash","r":204,"g":0,"b":154,"quad":false},
  {"i":19,"n":"星團","type":"PremiumStash","r":221,"g":221,"b":221,"quad":false},
  {"i":20,"n":"基底","type":"PremiumStash","r":255,"g":213,"b":0,"quad":false},
  {"i":21,"n":"基底","type":"PremiumStash","r":255,"g":213,"b":0,"quad":false},
  {"i":22,"n":"基底","type":"PremiumStash","r":255,"g":213,"b":0,"quad":false},
  {"i":23,"n":"基底大倉","type":"QuadStash","r":255,"g":213,"b":0,"quad":true},
  {"i":24,"n":"重複","type":"QuadStash","r":240,"g":255,"b":128,"quad":true},
  {"i":25,"n":"傳奇珠寶","type":"PremiumStash","r":204,"g":0,"b":154,"quad":false},
  {"i":26,"n":"深淵","type":"PremiumStash","r":90,"g":0,"b":179,"quad":false},
  {"i":27,"n":"停屍間","type":"PremiumStash","r":124,"g":84,"b":54,"quad":false},
  {"i":28,"n":"時間膠囊","type":"PremiumStash","r":255,"g":170,"b":0,"quad":false},
  {"i":29,"n":"時間膠囊","type":"PremiumStash","r":255,"g":170,"b":0,"quad":false},
  {"i":30,"n":"時間膠囊","type":"PremiumStash","r":255,"g":170,"b":0,"quad":false},
  {"i":31,"n":"6 (Remove-only)","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":32,"n":"基底大倉 (Remove-only)","type":"QuadStash","r":255,"g":213,"b":0,"quad":true},
  {"i":33,"n":"1 (Remove-only)","type":"NormalStash","r":124,"g":84,"b":54,"quad":false},
  {"i":34,"n":"- (Remove-only)","type":"PremiumStash","r":124,"g":84,"b":54,"quad":false},
  {"i":35,"n":"~b/o 1 divine (Remove-only)","type":"QuadStash","r":124,"g":84,"b":54,"quad":true},
];

/** 物品清單：永遠指向「當前聯盟」的物品，由 loadLeagueVault() 填入（就地置換，所有引用共享同一陣列）。 */
export const STASH_ITEMS: StashItem[] = [];

const CHAOS_PER_DIV = CURRENCY_META.C.perDiv;

export function tabSize(tab: number): number {
  return STASH_TABS.find((t) => t.i === tab)?.quad ? QUAD_SIZE : NORMAL_SIZE;
}

/**
 * 是否為「2D 網格」分頁（Quad/Normal/Premium）：物品的 x/y/w/h 直接對應格線座標。
 * 其餘特殊分頁（通貨/碎片/卡/技能…）使用各自的固定版面，x 為線性槽位、非格線座標，
 * 不能套用 grid 定位，改以 flow 排列顯示。
 */
const GRID_TAB_TYPES = new Set(['QuadStash', 'NormalStash', 'PremiumStash']);
export function isGridTab(tab: number): boolean {
  const t = STASH_TABS.find((x) => x.i === tab);
  return t ? GRID_TAB_TYPES.has(t.type) : true;
}

export function itemTotalChaos(it: StashItem): number {
  return it.value * (it.stack ?? 1);
}

/** 全庫總值（混沌石）；即時計算，物品載入後會反映新數字。 */
export function stashTotalChaos(): number {
  return STASH_ITEMS.reduce((s, it) => s + itemTotalChaos(it), 0);
}

export function tabItems(tab: number): StashItem[] {
  return STASH_ITEMS.filter((it) => it.tab === tab);
}

export function searchItems(q: string): StashItem[] {
  const k = q.trim();
  if (!k) return [];
  return STASH_ITEMS.filter((it) => it.name.includes(k) || it.base.includes(k));
}

/** 把混沌石數值格式化：≥ 1 div 顯示 div，否則顯示 c */
export function formatChaos(chaos: number): string {
  if (chaos >= CHAOS_PER_DIV) return `${(chaos / CHAOS_PER_DIV).toFixed(1)} div`;
  return `${Math.round(chaos)} c`;
}

/** 全庫總值換算成指定基準通貨 */
export function formatStashTotal(base: BaseCurrency): string {
  const div = stashTotalChaos() / CHAOS_PER_DIV;
  const meta = CURRENCY_META[base];
  const amount = div * meta.perDiv;
  const shown = meta.perDiv === 1 ? amount.toFixed(1) : Math.round(amount).toLocaleString('en-US');
  return `≈ ${shown} ${meta.unit}`;
}

// ── API 載入：raw（get-stash-items 物品）→ 顯示模型（StashItem）──────────────

/** PoE frameType → 顯示用稀有度色票（gem/divcard 等無對應者歸為通貨色）。 */
function frameToRarity(frame: number): Rarity {
  switch (frame) {
    case 0: return 'normal';
    case 1: return 'magic';
    case 2: return 'rare';
    case 3: return 'unique';
    case 4: return 'magic'; // gem
    case 5: return 'currency';
    default: return 'currency';
  }
}

/** 由穩定字串產生 mock 估值（1–50 c）；同一物品每次結果一致。 */
function mockValue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 50) + 1;
}

function rawToStashItem(raw: PoeStashItem, tab: number, idx: number): StashItem {
  const name = raw.name || raw.typeLine;
  const item: StashItem = {
    id: raw.id || `t${tab}-${idx}`,
    tab,
    name,
    base: raw.baseType || raw.typeLine,
    rarity: frameToRarity(raw.frameType),
    frame: raw.frameType,
    value: mockValue(raw.id || name),
    icon: raw.icon,
    x: raw.x, y: raw.y, w: raw.w, h: raw.h,
  };
  if (raw.stackSize !== undefined) item.stack = raw.stackSize;
  if (raw.ilvl !== undefined && raw.ilvl > 0) item.ilvl = raw.ilvl;
  const mods = [...(raw.implicitMods ?? []), ...(raw.explicitMods ?? [])];
  if (mods.length > 0) item.mods = mods;
  return item;
}

/** 從回應抽出 *Layout 物件（currencyLayout / fragmentLayout…），正規化為 StashLayout。 */
function extractLayout(res: Record<string, unknown>): StashLayout | undefined {
  const key = Object.keys(res).find((k) => k.endsWith('Layout') && typeof res[k] === 'object' && res[k] !== null);
  if (!key) return undefined;
  const raw = res[key] as { sections?: unknown; layout?: unknown } & Record<string, unknown>;
  // 形態一：{ sections, layout: {...} }；形態二：直接就是 slot map。
  const slotMap = (raw.layout ?? raw) as Record<string, LayoutSlot>;
  if (!slotMap || typeof slotMap !== 'object') return undefined;
  const sections = Array.isArray(raw.sections)
    ? raw.sections.filter((s): s is string => typeof s === 'string')
    : [];
  return { sections, slots: slotMap };
}

// ── 聯盟倉庫快取（vault）──────────────────────────────────────────────────
// 以聯盟為 key 快取各聯盟的倉庫物品與版面。切換聯盟時換內容；已載入過的聯盟直接用快取。
// STASH_ITEMS / activeLayouts 永遠指向「當前聯盟」（live binding）。

interface VaultData {
  items: StashItem[];
  layouts: Map<number, StashLayout>;
}
const VAULT = new Map<string, VaultData>();
let activeLayouts = new Map<number, StashLayout>();

/** 透過 API 逐頁載入指定聯盟的所有物品與特殊分頁版面。 */
async function fetchLeague(league: string): Promise<VaultData> {
  const bridge = window.poe;
  const items: StashItem[] = [];
  const layouts = new Map<number, StashLayout>();
  if (!bridge?.getStash) return { items, layouts };
  for (const t of STASH_TABS) {
    const res = await bridge.getStash(t.i, league);
    if (!res || !Array.isArray(res.items)) continue;
    res.items.forEach((raw, idx) => items.push(rawToStashItem(raw, t.i, idx)));
    const layout = extractLayout(res as unknown as Record<string, unknown>);
    if (layout) layouts.set(t.i, layout);
  }
  return { items, layouts };
}

/** 把指定聯盟的資料換進 STASH_ITEMS / activeLayouts（沿用同一陣列，維持 live binding）。 */
function setActive(data: VaultData): void {
  STASH_ITEMS.length = 0;
  STASH_ITEMS.push(...data.items);
  activeLayouts = data.layouts;
}

/** 取得當前聯盟某分頁的特殊版面（無則 undefined，代表用一般網格）。 */
export function tabLayout(tab: number): StashLayout | undefined {
  return activeLayouts.get(tab);
}

/**
 * 載入並切換到指定聯盟的倉庫；已載入過則直接用快取。
 * @param force 為 true 時忽略快取重新抓取（供「立即同步」使用）。
 */
export async function loadLeagueVault(league: string, force = false): Promise<void> {
  if (force || !VAULT.has(league)) {
    VAULT.set(league, await fetchLeague(league));
  }
  setActive(VAULT.get(league)!);
}

/** 該聯盟是否已載入過（用於 UI 顯示「尚未同步」）。 */
export function isLeagueLoaded(league: string): boolean {
  return VAULT.has(league);
}
