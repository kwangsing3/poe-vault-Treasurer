/**
 * 共用的 in-memory 狀態。
 *
 * 整個 app 是單一 renderer 視窗的 SPA，換頁時只會抽換 content 區、不重載頁面，
 * 所以這個 module-level 物件的內容在跨頁面時不會中斷（符合需求）。
 */

import type { BaseCurrency, Rarity } from './data';
import { STASH_ITEMS, type StashItem } from './stash';

export interface SelectedItem {
  name: string;
  rarity: Rarity;
  base?: string | undefined;
  value?: number | undefined; // 混沌石
  stack?: number | undefined;
  icon?: string | undefined;
  ilvl?: number | undefined;
  mods?: string[] | undefined;
}

export function toSelected(it: StashItem): SelectedItem {
  return {
    name: it.name,
    rarity: it.rarity,
    base: it.base,
    value: it.value,
    stack: it.stack,
    icon: it.icon,
    ilvl: it.ilvl,
    mods: it.mods,
  };
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
  /** 目前檢視的聯盟 */
  league: string;
  /** 可選聯盟清單（啟動時抓公用端點；連結帳號後改用 account 資訊，待實作） */
  leagues: string[];
  /** 自動同步開關 */
  autoSync: boolean;
  /** 上次成功同步倉庫的時間戳（ms）；尚未同步為 null */
  lastSync: number | null;
  /** 報表走勢的時間級距 */
  trendRange: '24h' | '7d' | '30d';
}

/** 聯盟清單的離線後備（抓取失敗時使用） */
export const LEAGUES = ['標準模式', '專家模式'];

const first = STASH_ITEMS[0];

export const store: AppState = {
  activeTab: 0,
  selectedItem: first ? toSelected(first) : null,
  searchQuery: '',
  filters: new Set<string>(['稀有度::稀有']),
  baseCurrency: 'D',
  league: '標準模式',
  leagues: [...LEAGUES],
  autoSync: true,
  lastSync: null,
  trendRange: '7d',
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
