import { RARITY_COLOR, RARITY_LABEL } from '../data';
import {
  STASH_ITEMS,
  STASH_TABS,
  formatChaos,
  formatStashTotal,
  searchItems,
  tabItems,
  tabSize,
  type StashItem,
} from '../stash';
import { store, toSelected, update } from '../store';
import { navigate } from '../router';
import type { View } from '../router';

const QUAD_CELL = 30; // px
const NORMAL_CELL = 46; // px

function isSearching(): boolean {
  return store.searchQuery.trim().length > 0;
}

function itemHTML(it: StashItem, positioned: boolean): string {
  const sel = it.name === store.selectedItem?.name ? 'sel' : '';
  const pos = positioned
    ? `grid-column:${it.x + 1}/span ${it.w};grid-row:${it.y + 1}/span ${it.h};`
    : '';
  const stack = it.stack !== undefined ? `<span class="stack">${it.stack}</span>` : '';
  return `<div class="gitem ${sel}" style="${pos}--rc:${RARITY_COLOR[it.rarity]};" data-id="${it.id}" title="${it.name}">
    <img src="${it.icon}" alt="${it.name}" loading="lazy" />${stack}
  </div>`;
}

function gridHTML(): string {
  const tab = store.activeTab;
  const n = tabSize(tab);
  const cell = n >= 24 ? QUAD_CELL : NORMAL_CELL;

  if (isSearching()) {
    const found = searchItems(store.searchQuery);
    const items = found.map((it) => itemHTML(it, false)).join('');
    return `<div class="real-grid search" style="--cell:${NORMAL_CELL}px;--n:12;">
      <div class="rg-flow">${items || '<span class="rg-empty">沒有符合的物品</span>'}</div>
    </div>`;
  }

  const items = tabItems(tab);
  const bg = Array.from({ length: n * n }, () => '<div class="gcell"></div>').join('');
  const gitems = items.map((it) => itemHTML(it, true)).join('');
  const empty = items.length === 0 ? '<div class="rg-hint">此頁尚未抓取資料（目前僅同步 tab 0）</div>' : '';
  return `<div class="real-grid" style="--cell:${cell}px;--n:${n};">
    <div class="rg-bg">${bg}</div>
    <div class="rg-items">${gitems}</div>
    ${empty}
  </div>`;
}

function footerHTML(): string {
  if (isSearching()) {
    const found = searchItems(store.searchQuery);
    return `符合「${store.searchQuery.trim()}」· ${found.length} 件 · 全庫 ${STASH_ITEMS.length} 件 · 估值合計 ${formatStashTotal(store.baseCurrency)}`;
  }
  const t = STASH_TABS.find((x) => x.i === store.activeTab);
  const items = tabItems(store.activeTab);
  const label = t ? `${t.n} · ${t.quad ? '巨型 24×24' : '一般 12×12'}` : `分頁 ${store.activeTab}`;
  return `${label} · ${items.length} 件 · 全庫 ${STASH_ITEMS.length} 件 · 估值合計 ${formatStashTotal(store.baseCurrency)}`;
}

function plaque(): string {
  const sel = store.selectedItem;
  const color = sel ? RARITY_COLOR[sel.rarity] : '#cdc9c0';
  const rarity = sel ? RARITY_LABEL[sel.rarity] : '—';
  const sub = sel ? `${rarity} · ${sel.base ?? '—'}` : '—';
  const art = sel?.icon
    ? `<div class="art has-img"><img src="${sel.icon}" alt="${sel.name}" /></div>`
    : `<div class="art">ITEM ART</div>`;
  const priceLine =
    sel && sel.value !== undefined
      ? sel.stack !== undefined
        ? `${formatChaos(sel.value)} / 個 · ×${sel.stack.toLocaleString('en-US')}`
        : formatChaos(sel.value)
      : '—';
  return `
    <div class="plaque">
      <span class="kicker">選中物品 · 銘牌</span>
      ${art}
      <div style="display:flex;flex-direction:column;gap:5px;">
        <span class="serif" style="font-size:21px;color:${color};">${sel?.name ?? '未選擇'}</span>
        <span class="kicker" style="letter-spacing:0.08em;">${sub}</span>
      </div>
      <div class="divider"></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <span class="ink-2" style="font:500 12px/1 var(--sans);">估值（mock）</span>
        <span style="font:600 18px/1 var(--sans);">${priceLine}</span>
      </div>
      <button class="btn btn-dark" data-go="detail" style="margin-top:auto;">查價 / 加入擺攤 →</button>
    </div>`;
}

export const overview: View = {
  render() {
    const tabs = STASH_TABS.map((t) => {
      const active = t.i === store.activeTab && !isSearching() ? 'active' : '';
      const dot = `rgb(${t.r},${t.g},${t.b})`;
      const badge = t.quad ? '<span class="badge">巨</span>' : '';
      return `<div class="tab-item ${active}" data-tab="${t.i}">
        <span class="sq" style="background:${dot};"></span><span class="tn">${t.n}</span>${badge}
      </div>`;
    }).join('');

    return `
      <div class="page-head">
        <span class="num">01</span><span class="ttl">倉庫總覽 · Stash 網格</span>
        <span class="sub">一眼看清整庫存貨</span>
      </div>
      <div class="panel">
        <div class="overview">
          <div class="tab-rail">
            <span class="lbl">倉庫頁 · ${STASH_TABS.length}</span>
            ${tabs}
          </div>
          <div class="grid-area">
            <div class="grid-tools">
              <input class="search-box" id="ov-search" placeholder="⌕  搜尋物品 / 基底…" />
              <div class="btn" style="height:30px;">價值 ↓</div>
            </div>
            <div class="grid-wrap" id="ov-grid">${gridHTML()}</div>
            <div class="hand" id="ov-footer" style="font-size:16px;">${footerHTML()}</div>
          </div>
          ${plaque()}
        </div>
      </div>`;
  },

  mount(root) {
    const gridEl = root.querySelector<HTMLElement>('#ov-grid');
    const footerEl = root.querySelector<HTMLElement>('#ov-footer');

    const wireCells = () => {
      gridEl?.querySelectorAll<HTMLElement>('[data-id]').forEach((el) =>
        el.addEventListener('click', () => {
          const it = STASH_ITEMS.find((x) => x.id === el.dataset['id']);
          if (it) update((s) => (s.selectedItem = toSelected(it)));
        }),
      );
    };

    const refreshGrid = () => {
      if (gridEl) gridEl.innerHTML = gridHTML();
      if (footerEl) footerEl.textContent = footerHTML();
      wireCells();
    };

    const search = root.querySelector<HTMLInputElement>('#ov-search');
    if (search) {
      search.value = store.searchQuery;
      search.addEventListener('input', () => {
        store.searchQuery = search.value;
        refreshGrid();
      });
    }

    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) =>
      el.addEventListener('click', () =>
        update((s) => {
          s.activeTab = Number(el.dataset['tab']);
          s.searchQuery = '';
        }),
      ),
    );

    wireCells();
    root.querySelector<HTMLElement>('[data-go="detail"]')?.addEventListener('click', () => navigate('detail'));
  },
};
