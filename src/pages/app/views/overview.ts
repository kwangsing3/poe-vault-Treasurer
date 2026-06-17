import { buildGridCells, RARITY_COLOR, RARITY_LABEL, TABS, type GridCell } from '../data';
import { store, update } from '../store';
import { navigate } from '../router';
import type { View } from '../router';

const cells = buildGridCells();

function plaque(): string {
  const sel = store.selectedItem;
  const color = sel ? RARITY_COLOR[sel.rarity] : '#cdc9c0';
  const rarity = sel ? RARITY_LABEL[sel.rarity] : '—';
  return `
    <div class="plaque">
      <span class="kicker">選中物品 · 銘牌</span>
      <div class="art">ITEM ART</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        <span class="serif" style="font-size:22px;color:${color};">${sel?.name ?? '未選擇'}</span>
        <span class="kicker" style="letter-spacing:0.1em;">${rarity} · 頭部護甲</span>
      </div>
      <div class="divider"></div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <span class="ink-2" style="font:500 12px/1 var(--sans);">官方均價</span>
        <span style="font:600 20px/1 var(--sans);">12 div</span>
      </div>
      <button class="btn btn-dark" data-go="detail" style="margin-top:auto;">查價 / 加入擺攤 →</button>
    </div>`;
}

export const overview: View = {
  render() {
    const tabs = TABS.map(
      (t) => `
      <div class="tab-item ${t.id === store.activeTab ? 'active' : ''}" data-tab="${t.id}">
        <span class="sq"></span><span>${t.n}</span>
      </div>`,
    ).join('');

    const grid = cells
      .map((c: GridCell, i) => {
        if (!c.filled) return `<div class="cell"></div>`;
        const sel = store.selectedItem?.name === c.name ? 'sel' : '';
        return `<div class="cell filled ${sel}" data-cell="${i}">
          <div class="item" style="background:${RARITY_COLOR[c.rarity!]};"></div>
        </div>`;
      })
      .join('');

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
              <input class="search-box" id="ov-search" placeholder="⌕  搜尋物品 / 詞綴…" />
              <div class="btn" style="height:30px;">價值 ↓</div>
            </div>
            <div class="stash-grid">${grid}</div>
            <div class="hand" style="font-size:16px;">27 件已識別 · 估值已計入總資產</div>
          </div>
          ${plaque()}
        </div>
      </div>`;
  },

  mount(root) {
    const search = root.querySelector<HTMLInputElement>('#ov-search');
    if (search) {
      search.value = store.searchQuery;
      search.addEventListener('input', () => {
        store.searchQuery = search.value; // 直接寫入，不重繪以保留焦點
      });
    }

    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) =>
      el.addEventListener('click', () =>
        update((s) => {
          s.activeTab = Number(el.dataset['tab']);
        }),
      ),
    );

    root.querySelectorAll<HTMLElement>('[data-cell]').forEach((el) =>
      el.addEventListener('click', () => {
        const c = cells[Number(el.dataset['cell'])];
        if (!c || !c.filled) return;
        update((s) => {
          s.selectedItem = { name: c.name!, rarity: c.rarity! };
        });
        navigate('detail');
      }),
    );

    root.querySelector<HTMLElement>('[data-go="detail"]')?.addEventListener('click', () => navigate('detail'));
  },
};
