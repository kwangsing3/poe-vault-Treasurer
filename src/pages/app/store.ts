/**
 * 共用的 in-memory 狀態。
 *
 * 整個 app 是單一 renderer 視窗的 SPA，換頁時只會抽換 content 區、不重載頁面，
 * 所以這個 module-level 物件的內容在跨頁面時不會中斷（符合需求）。
 * 功能本身先不要求正確，重點是狀態連續性。
 */

import type { BaseCurrency, Rarity } from './data';

export interface SelectedItem {
  name: string;
  rarity: Rarity;
}

export interface AppState {
  /** 目前停在第幾號倉庫頁 */
  activeTab: number;
  /** 從總覽點選、帶到詳情頁的物品 */
  selectedItem: SelectedItem | null;
  /** 搜尋字串（離開搜尋頁再回來仍保留） */
  searchQuery: string;
  /** 已勾選的篩選選項（"群組::選項"） */
  filters: Set<string>;
  /** 結算用的基準通貨 */
  baseCurrency: BaseCurrency;
  /** 自動同步開關 */
  autoSync: boolean;
}

export const store: AppState = {
  activeTab: 2,
  selectedItem: { name: '灰焰之冠', rarity: 'rare' },
  searchQuery: '',
  filters: new Set<string>(['稀有度::稀有']),
  baseCurrency: 'D',
  autoSync: true,
};

/** 訂閱者：狀態變更後要重繪的回呼（由 router 註冊） */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): void {
  listeners.add(fn);
}

/** 修改狀態並通知重繪 */
export function update(mutate: (s: AppState) => void): void {
  mutate(store);
  for (const fn of listeners) fn();
}
