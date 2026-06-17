/**
 * Mock 資料 — 取自 Claude Design 線框的 renderVals。
 * 這些只是讓畫面有東西可顯示，之後會由 PoE API + 估價來源取代。
 */

export type Rarity = 'normal' | 'magic' | 'rare' | 'unique' | 'currency';

export const RARITY_COLOR: Record<Rarity, string> = {
  normal: '#9b988f',
  magic: '#5f79bd',
  rare: '#c2a52f',
  unique: '#a86a3c',
  currency: '#b8924a',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  normal: '普通',
  magic: '魔法',
  rare: '稀有',
  unique: '傳奇',
  currency: '通貨',
};

export interface GridCell {
  filled: boolean;
  rarity?: Rarity | undefined;
  name?: string | undefined;
}

/** stash 網格：96 格，部分填入物品（對照線框的 itemMap） */
export function buildGridCells(): GridCell[] {
  const itemMap: Record<number, Rarity> = {
    3: 'rare', 5: 'currency', 8: 'magic', 11: 'unique', 14: 'currency', 19: 'rare', 22: 'normal',
    27: 'currency', 30: 'magic', 33: 'rare', 38: 'unique', 41: 'currency', 46: 'currency', 49: 'rare',
    52: 'magic', 57: 'normal', 60: 'currency', 63: 'rare', 68: 'unique', 71: 'currency', 74: 'magic',
    79: 'rare', 82: 'currency', 85: 'normal', 88: 'currency', 91: 'rare', 94: 'magic',
  };
  const names: Partial<Record<Rarity, string>> = {
    rare: '灰焰之冠', magic: '低語之戒', unique: '淨世聖杯', currency: '崇高石', normal: '鏽蝕板甲',
  };
  const cells: GridCell[] = [];
  for (let i = 0; i < 96; i++) {
    const r = itemMap[i];
    cells.push(r ? { filled: true, rarity: r, name: names[r] } : { filled: false });
  }
  return cells;
}

export const TABS = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  n: String(i + 1).padStart(2, '0'),
}));

export interface ShowcaseItem {
  name: string; en: string; rarity: string; rarityKey: Rarity; price: string; type: string;
}
export const SHOWCASE: ShowcaseItem[] = [
  { name: '淨世聖杯', en: 'PURITY CHALICE', rarity: '傳奇', rarityKey: 'unique', price: '85 div', type: '獨特護身符' },
  { name: '灰焰之冠', en: 'ASHEN DIADEM', rarity: '稀有', rarityKey: 'rare', price: '12 div', type: '頭部護甲' },
  { name: '低語之戒', en: 'WHISPER BAND', rarity: '魔法', rarityKey: 'magic', price: '40 c', type: '戒指' },
  { name: '崇高石', en: 'EXALTED ORB', rarity: '通貨', rarityKey: 'currency', price: '×56', type: '通貨' },
];

export const MODS: string[] = [
  '+42 智慧',
  '+18% 全域法術傷害',
  '+65 最大魔力',
  '法術暴擊率 +1.8%',
  '+24% 冷卻回復速度',
  '受到傷害的 8% 由魔力承受',
];

export interface PriceRow { src: string; price: string; hint: string; }
export const PRICE_ROWS: PriceRow[] = [
  { src: '官方交易站', price: '12.4 div', hint: '21 條在售' },
  { src: '近 7 日均價', price: '11.8 div', hint: '+5%' },
  { src: '批發 / 快出價', price: '10.0 div', hint: '估值' },
];

export interface FilterGroup { title: string; opts: string[]; }
export const FILTER_GROUPS: FilterGroup[] = [
  { title: '稀有度', opts: ['普通', '魔法', '稀有', '傳奇', '通貨'] },
  { title: '物品類型', opts: ['武器', '護甲', '飾品', '寶石', '地圖'] },
  { title: '價格區間', opts: ['< 1 c', '1–20 c', '20 c – 1 div', '> 1 div'] },
];

export interface ResultItem { name: string; rarity: string; rarityKey: Rarity; price: string; }
export const RESULTS: ResultItem[] = [
  { name: '灰焰之冠', rarity: '稀有', rarityKey: 'rare', price: '12 div' },
  { name: '低語之戒', rarity: '魔法', rarityKey: 'magic', price: '40 c' },
  { name: '風暴召喚者', rarity: '傳奇', rarityKey: 'unique', price: '3 div' },
  { name: '秘法符文', rarity: '通貨', rarityKey: 'currency', price: '180 c' },
  { name: '破曉胸甲', rarity: '稀有', rarityKey: 'rare', price: '8 div' },
];

export interface CurrencyRow { name: string; rarityKey: Rarity; count: string; value: string; }
export const CURRENCY_ROWS: CurrencyRow[] = [
  { name: '神聖石 Divine', rarityKey: 'currency', count: '128', value: '128.0 div' },
  { name: '混沌石 Chaos', rarityKey: 'normal', count: '4,210', value: '24.8 div' },
  { name: '崇高石 Exalt', rarityKey: 'unique', count: '56', value: '2.1 div' },
];

/** 近 30 天總資產走勢（高度百分比，0–100） */
export function buildHistoryBars(): { h: number; peak: boolean }[] {
  const base: number[] = [];
  let v = 300;
  for (let i = 0; i < 30; i++) {
    v += Math.sin(i / 3) * 8 + i * 2.2 + (i % 5 === 0 ? 14 : -4);
    base.push(Math.max(40, Math.round(v)));
  }
  const maxV = Math.max(...base);
  return base.map((x, i) => ({ h: Math.round((x / maxV) * 100), peak: i === base.length - 1 }));
}

/** 基準通貨：以 Divine 為基底的 mock 換算率 */
export type BaseCurrency = 'C' | 'D' | 'E';
export const TOTAL_DIV = 412.3;
export const CURRENCY_META: Record<BaseCurrency, { label: string; perDiv: number; unit: string }> = {
  C: { label: '混沌 C', perDiv: 215, unit: 'c' },
  D: { label: '神聖 D', perDiv: 1, unit: 'div' },
  E: { label: '崇高 E', perDiv: 12, unit: 'e' },
};

export function formatTotal(base: BaseCurrency): string {
  const meta = CURRENCY_META[base];
  const amount = TOTAL_DIV * meta.perDiv;
  const shown = meta.perDiv === 1 ? amount.toFixed(1) : Math.round(amount).toLocaleString('en-US');
  return `≈ ${shown} ${meta.unit}`;
}
