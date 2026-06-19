/**
 * 共用設計常數：稀有度色票/標籤、基準通貨換算率。
 * 仍含少量線框遺留的 mock（PRICE_ROWS — 非傳奇物品的佔位比價列），其餘交由 PoE API + 估價來源。
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

// 非傳奇物品的詳情銘牌仍以這份 mock 比價列佔位（傳奇走真實 trade 估價，見 prices.ts）。
export interface PriceRow { src: string; price: string; hint: string; }
export const PRICE_ROWS: PriceRow[] = [
  { src: '官方交易站', price: '12.4 div', hint: '21 條在售' },
  { src: '近 7 日均價', price: '11.8 div', hint: '+5%' },
  { src: '批發 / 快出價', price: '10.0 div', hint: '估值' },
];

/** 基準通貨：以 Divine 為基底的換算率（總資產結算用，見 stash.ts 的 formatStashTotal）。 */
export type BaseCurrency = 'C' | 'D' | 'E';
export const CURRENCY_META: Record<BaseCurrency, { label: string; perDiv: number; unit: string }> = {
  C: { label: '混沌 C', perDiv: 215, unit: 'c' },
  D: { label: '神聖 D', perDiv: 1, unit: 'div' },
  E: { label: '崇高 E', perDiv: 12, unit: 'e' },
};
