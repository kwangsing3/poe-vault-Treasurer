import { RARITY_COLOR, RARITY_LABEL, type Rarity } from '../data';
import { STASH_ITEMS, formatChaos, searchItems, type StashItem } from '../stash';
import { store, toSelected, update } from '../store';
import { navigate } from '../router';
import type { View } from '../router';

// 可實作的篩選：稀有度與單價區間（估價來源未接，價格區間以 mock 估值計）。
const RARITY_OPTS: { label: string; key: Rarity }[] = [
  { label: '普通', key: 'normal' },
  { label: '魔法', key: 'magic' },
  { label: '稀有', key: 'rare' },
  { label: '傳奇', key: 'unique' },
  { label: '通貨', key: 'currency' },
];

// 價格區間（混沌石；1 div = 215 c，與 data.ts 的 CURRENCY_META 一致）
const PRICE_OPTS: { label: string; min: number; max: number }[] = [
  { label: '< 1 c', min: 0, max: 1 },
  { label: '1–20 c', min: 1, max: 20 },
  { label: '20 c – 1 div', min: 20, max: 215 },
  { label: '> 1 div', min: 215, max: Infinity },
];

const RARITY_GROUP = '稀有度';
const PRICE_GROUP = '價格區間';

const MAX_ROWS = 200;

function selectedKeys(group: string): string[] {
  const prefix = `${group}::`;
  return [...store.filters].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
}

/** 套用搜尋字串 + 已勾選篩選，回傳當前聯盟符合的物品。 */
function filtered(): StashItem[] {
  const q = store.searchQuery.trim();
  let items = q ? searchItems(q) : STASH_ITEMS;

  const rarities = selectedKeys(RARITY_GROUP);
  if (rarities.length) {
    const set = new Set(rarities.map((label) => RARITY_OPTS.find((o) => o.label === label)?.key));
    items = items.filter((it) => set.has(it.rarity));
  }

  const priceLabels = selectedKeys(PRICE_GROUP);
  if (priceLabels.length) {
    const ranges = PRICE_OPTS.filter((o) => priceLabels.includes(o.label));
    items = items.filter((it) => ranges.some((r) => it.value >= r.min && it.value < r.max));
  }

  return items;
}

export const search: View = {
  render() {
    const checkGroup = (title: string, labels: string[]): string => `
      <div class="filter-group">
        <span class="kicker">${title}</span>
        ${labels
          .map((o) => {
            const key = `${title}::${o}`;
            const on = store.filters.has(key) ? 'on' : '';
            return `<div class="check" data-filter="${key}">
              <span class="box ${on}">${on ? '✓' : ''}</span>
              <span style="font:500 12px/1 var(--sans);color:#3a3833;">${o}</span>
            </div>`;
          })
          .join('')}
      </div>`;

    const filters =
      checkGroup(RARITY_GROUP, RARITY_OPTS.map((o) => o.label)) +
      checkGroup(PRICE_GROUP, PRICE_OPTS.map((o) => o.label));

    const found = filtered();
    const shown = found.slice(0, MAX_ROWS);
    const rows = shown
      .map(
        (it) => `
      <div class="result-row" data-id="${it.id}">
        <div style="flex:1;display:flex;align-items:center;gap:11px;">
          <img class="ico" src="${it.icon}" alt="${it.name}" loading="lazy" style="object-fit:contain;background:transparent;" />
          <span style="font:500 13px/1 var(--sans);">${it.name}${it.stack !== undefined ? ` <span style="color:var(--muted-2);">×${it.stack}</span>` : ''}</span>
        </div>
        <span style="width:90px;font:500 12px/1 var(--sans);color:var(--muted-2);">${RARITY_LABEL[it.rarity]}</span>
        <span style="width:90px;text-align:right;font:600 14px/1 var(--sans);">${formatChaos(it.value)}</span>
      </div>`,
      )
      .join('');

    const more =
      found.length > MAX_ROWS
        ? `<div class="hand" style="padding:14px 18px;font-size:16px;">… 另有 ${found.length - MAX_ROWS} 件，請用搜尋或篩選縮小範圍</div>`
        : '';
    const empty = found.length === 0 ? '<div class="hand" style="padding:18px;font-size:16px;">沒有符合的物品</div>' : '';
    const count = store.filters.size;

    return `
      <div class="page-head">
        <span class="num">03</span><span class="ttl">搜尋與篩選</span>
        <span class="sub">在 ${STASH_ITEMS.length} 件裡精準定位</span>
      </div>
      <div class="panel">
        <div class="panel-bar">
          <span class="name">搜 尋</span>
          <input class="search-box" id="se-search" style="max-width:420px;margin-left:10px;" placeholder="⌕  物品名稱 / 基底…" />
          <div style="flex:1;"></div>
          <span class="ink-2" style="font:500 12px/1 var(--sans);">${found.length} 件結果 · ${count} 項篩選</span>
        </div>
        <div class="search">
          <div class="filter-rail">
            ${filters}
            <button class="btn" data-reset style="margin-top:auto;height:34px;">重置篩選</button>
          </div>
          <div class="results">
            <div class="results-head">
              <span style="flex:1;">物品</span>
              <span style="width:90px;">稀有度</span>
              <span style="width:90px;text-align:right;">估價（mock）</span>
            </div>
            ${rows}${empty}${more}
          </div>
        </div>
      </div>`;
  },

  mount(root) {
    // 任一互動後就地重繪結果區，不用整頁 store 重繪（避免輸入框失焦）。
    const rerender = () => {
      const panel = (root.closest('#content') as HTMLElement | null) ?? root;
      panel.innerHTML = this.render();
      this.mount?.(panel);
    };

    const input = root.querySelector<HTMLInputElement>('#se-search');
    if (input) {
      input.value = store.searchQuery;
      input.addEventListener('input', () => {
        store.searchQuery = input.value;
        rerender();
        root.querySelector<HTMLInputElement>('#se-search')?.focus();
      });
    }

    root.querySelectorAll<HTMLElement>('[data-filter]').forEach((el) =>
      el.addEventListener('click', () => {
        const key = el.dataset['filter']!;
        if (store.filters.has(key)) store.filters.delete(key);
        else store.filters.add(key);
        rerender();
      }),
    );

    root.querySelector<HTMLElement>('[data-reset]')?.addEventListener('click', () => {
      store.filters.clear();
      rerender();
    });

    root.querySelectorAll<HTMLElement>('[data-id]').forEach((el) =>
      el.addEventListener('click', () => {
        const it = STASH_ITEMS.find((x) => x.id === el.dataset['id']);
        if (!it) return;
        update((s) => (s.selectedItem = toSelected(it)));
        navigate('detail');
      }),
    );
  },
};
