import { RARITY_COLOR, RARITY_LABEL } from '../data';
import {
  STASH_ITEMS,
  STASH_TABS,
  formatChaos,
  formatStashTotal,
  isGridTab,
  searchItems,
  tabItems,
  tabSize,
  type StashItem,
} from '../stash';
import { store, toSelected } from '../store';
import { priceLinesHTML, priceStateFor, keyOf, setPriceResolveHook } from '../prices';
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

  // 特殊分頁（通貨/碎片/卡…）座標非格線，改用 flow 排列。
  if (!isGridTab(tab)) {
    const flow = items.map((it) => itemHTML(it, false)).join('');
    return `<div class="real-grid search" style="--cell:${NORMAL_CELL}px;--n:12;">
      <div class="rg-flow">${flow || '<span class="rg-empty">此頁沒有物品</span>'}</div>
    </div>`;
  }

  const bg = Array.from({ length: n * n }, () => '<div class="gcell"></div>').join('');
  const gitems = items.map((it) => itemHTML(it, true)).join('');
  const empty = items.length === 0 ? '<div class="rg-hint">此頁沒有物品</div>' : '';
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

/** 銘牌內層（不含 .plaque 外殼），供就地刷新而不重建外層元素。 */
function plaqueInner(): string {
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
  // 市場價只對傳奇物品顯示（其餘無 trade 估價來源）。
  const marketLine =
    sel?.rarity === 'unique'
      ? `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <span class="ink-2" style="font:500 12px/1 var(--sans);">市場價</span>
        <span style="font:600 14px/1 var(--sans);text-align:right;">${priceLinesHTML(priceStateFor(sel.name, sel.base))}</span>
      </div>`
      : '';
  return `
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
      ${marketLine}
      <button class="btn btn-dark" data-go="detail" style="margin-top:auto;">查價 / 加入擺攤 →</button>`;
}

function plaque(): string {
  return `<div class="plaque" id="ov-plaque">${plaqueInner()}</div>`;
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
    const plaqueEl = root.querySelector<HTMLElement>('#ov-plaque');

    // 就地刷新銘牌（詳情按鈕在銘牌內，重繪後需重新綁定）。
    const refreshPlaque = () => {
      if (!plaqueEl) return;
      plaqueEl.innerHTML = plaqueInner();
      plaqueEl
        .querySelector<HTMLElement>('[data-go="detail"]')
        ?.addEventListener('click', () => navigate('detail'));
    };

    const wireCells = () => {
      gridEl?.querySelectorAll<HTMLElement>('[data-id]').forEach((el) =>
        el.addEventListener('click', () => {
          const it = STASH_ITEMS.find((x) => x.id === el.dataset['id']);
          if (!it) return;
          // 就地更新選取狀態：只刷新銘牌與高亮，不走全域 update()（保留捲動位置）。
          store.selectedItem = toSelected(it);
          gridEl.querySelectorAll('[data-id].sel').forEach((s) => s.classList.remove('sel'));
          el.classList.add('sel');
          refreshPlaque();
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

    // 切頁籤就地更新（不走全域 update()，避免整個 app 重繪而重置 .content / .tab-rail 的捲動位置）。
    const tabEls = root.querySelectorAll<HTMLElement>('[data-tab]');
    tabEls.forEach((el) =>
      el.addEventListener('click', () => {
        const tab = Number(el.dataset['tab']);
        store.activeTab = tab;
        store.searchQuery = '';
        if (search) search.value = '';
        tabEls.forEach((t) => t.classList.toggle('active', Number(t.dataset['tab']) === tab));
        refreshGrid();
      }),
    );

    wireCells();
    refreshPlaque();

    // 背景估價回來時，若更新的正是當前選中的傳奇物品，就地刷新銘牌的市場價。
    setPriceResolveHook((key) => {
      const sel = store.selectedItem;
      if (sel && key === keyOf(sel.name, sel.base)) refreshPlaque();
    });
  },
};
