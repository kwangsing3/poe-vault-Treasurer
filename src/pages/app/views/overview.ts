import { RARITY_COLOR, RARITY_LABEL } from '../data';
import { STASH_ITEMS, formatChaos, formatStashTotal, searchItems, tabItems, type StashItem } from '../stash';
import { store, toSelected, update } from '../store';
import { navigate } from '../router';
import type { View } from '../router';

const TABS = Array.from({ length: 8 }, (_, i) => i + 1);
/** 巨型倉庫頁（PoE Quad Tab）：24×24 = 576 格；一般頁：12×12 = 144 格 */
const GIANT_TABS = new Set([6, 7, 8]);
const NORMAL_CAP = 12 * 12;
const GIANT_CAP = 24 * 24;

function isGiantView(): boolean {
  return !store.searchQuery.trim() && GIANT_TABS.has(store.activeTab);
}

function shownItems(): StashItem[] {
  const q = store.searchQuery.trim();
  return q ? searchItems(q) : tabItems(store.activeTab);
}

function cellInner(it: StashItem): string {
  if (it.icon) return `<img class="item-img" src="${it.icon}" alt="${it.name}" loading="lazy" />`;
  return `<div class="item" style="background:${RARITY_COLOR[it.rarity]};"></div>`;
}

function gridHTML(shown: StashItem[]): string {
  const baseCap = isGiantView() ? GIANT_CAP : NORMAL_CAP;
  const cap = Math.max(baseCap, shown.length);
  const selName = store.selectedItem?.name;
  const cells: string[] = [];
  for (let i = 0; i < cap; i++) {
    const it = shown[i];
    if (!it) { cells.push('<div class="cell"></div>'); continue; }
    const sel = it.name === selName ? 'sel' : '';
    cells.push(`<div class="cell filled ${sel}" data-id="${it.id}" title="${it.name}">${cellInner(it)}</div>`);
  }
  return cells.join('');
}

function gridClass(): string {
  return isGiantView() ? 'stash-grid giant' : 'stash-grid';
}

function footerHTML(shown: StashItem[]): string {
  const q = store.searchQuery.trim();
  const scope = q
    ? `符合「${q}」`
    : `倉庫頁 ${String(store.activeTab).padStart(2, '0')}${GIANT_TABS.has(store.activeTab) ? ' · 巨型 24×24' : ''}`;
  return `${scope} · ${shown.length} 件 · 全庫 ${STASH_ITEMS.length} 件 · 估值合計 ${formatStashTotal(store.baseCurrency)}`;
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
        <span class="serif" style="font-size:22px;color:${color};">${sel?.name ?? '未選擇'}</span>
        <span class="kicker" style="letter-spacing:0.1em;">${sub}</span>
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
    const shown = shownItems();
    const tabs = TABS.map((t) => {
      const active = t === store.activeTab && !store.searchQuery.trim() ? 'active' : '';
      const badge = GIANT_TABS.has(t) ? '<span class="badge">巨</span>' : '';
      return `<div class="tab-item ${active}" data-tab="${t}">
        <span class="sq"></span><span>${String(t).padStart(2, '0')}</span>${badge}
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
            <span class="lbl">倉庫頁</span>
            ${tabs}
            <div class="tab-add">+ 通貨 / 碎片</div>
          </div>
          <div class="grid-area">
            <div class="grid-tools">
              <input class="search-box" id="ov-search" placeholder="⌕  搜尋物品 / 基底…" />
              <div class="btn" style="height:30px;">價值 ↓</div>
            </div>
            <div class="${gridClass()}" id="ov-grid">${gridHTML(shown)}</div>
            <div class="hand" id="ov-footer" style="font-size:16px;">${footerHTML(shown)}</div>
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
      const shown = shownItems();
      if (gridEl) {
        gridEl.className = gridClass();
        gridEl.innerHTML = gridHTML(shown);
      }
      if (footerEl) footerEl.textContent = footerHTML(shown);
      wireCells();
    };

    const search = root.querySelector<HTMLInputElement>('#ov-search');
    if (search) {
      search.value = store.searchQuery;
      search.addEventListener('input', () => {
        store.searchQuery = search.value; // 不走 update()，避免重繪導致輸入框失焦
        refreshGrid();
      });
    }

    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) =>
      el.addEventListener('click', () =>
        update((s) => {
          s.activeTab = Number(el.dataset['tab']);
          s.searchQuery = ''; // 點倉庫頁時清掉搜尋，讓分頁有意義
        }),
      ),
    );

    wireCells();

    root.querySelector<HTMLElement>('[data-go="detail"]')?.addEventListener('click', () => navigate('detail'));
  },
};
