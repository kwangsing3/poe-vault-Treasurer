import { FILTER_GROUPS, RARITY_COLOR, RESULTS } from '../data';
import { store, update } from '../store';
import { navigate } from '../router';
import type { View } from '../router';

export const search: View = {
  render() {
    const filters = FILTER_GROUPS.map(
      (g) => `
      <div class="filter-group">
        <span class="kicker">${g.title}</span>
        ${g.opts
          .map((o) => {
            const key = `${g.title}::${o}`;
            const on = store.filters.has(key) ? 'on' : '';
            return `<div class="check" data-filter="${key}">
              <span class="box ${on}">${on ? '✓' : ''}</span>
              <span style="font:500 12px/1 var(--sans);color:#3a3833;">${o}</span>
            </div>`;
          })
          .join('')}
      </div>`,
    ).join('');

    const rows = RESULTS.map(
      (r, i) => `
      <div class="result-row" data-result="${i}">
        <div style="flex:1;display:flex;align-items:center;gap:11px;">
          <div class="ico" style="background:${RARITY_COLOR[r.rarityKey]};"></div>
          <span style="font:500 13px/1 var(--sans);">${r.name}</span>
        </div>
        <span style="width:90px;font:500 12px/1 var(--sans);color:var(--muted-2);">${r.rarity}</span>
        <span style="width:90px;text-align:right;font:600 14px/1 var(--sans);">${r.price}</span>
      </div>`,
    ).join('');

    const count = store.filters.size;

    return `
      <div class="page-head">
        <span class="num">03</span><span class="ttl">搜尋與篩選</span>
        <span class="sub">在 482 件裡精準定位</span>
      </div>
      <div class="panel">
        <div class="panel-bar">
          <span class="name">搜 尋</span>
          <input class="search-box" id="se-search" style="max-width:420px;margin-left:10px;" placeholder="⌕  灰焰…" />
          <div style="flex:1;"></div>
          <span class="ink-2" style="font:500 12px/1 var(--sans);">${RESULTS.length} 條結果 · ${count} 項篩選</span>
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
              <span style="width:90px;text-align:right;">估價</span>
            </div>
            ${rows}
            <div class="hand" style="padding:14px 18px;font-size:16px;">… 另有 43 條，滾動載入</div>
          </div>
        </div>
      </div>`;
  },

  mount(root) {
    const input = root.querySelector<HTMLInputElement>('#se-search');
    if (input) {
      input.value = store.searchQuery;
      input.addEventListener('input', () => {
        store.searchQuery = input.value;
      });
    }

    root.querySelectorAll<HTMLElement>('[data-filter]').forEach((el) =>
      el.addEventListener('click', () =>
        update((s) => {
          const key = el.dataset['filter']!;
          if (s.filters.has(key)) s.filters.delete(key);
          else s.filters.add(key);
        }),
      ),
    );

    root.querySelector<HTMLElement>('[data-reset]')?.addEventListener('click', () =>
      update((s) => s.filters.clear()),
    );

    root.querySelectorAll<HTMLElement>('[data-result]').forEach((el) =>
      el.addEventListener('click', () => {
        const r = RESULTS[Number(el.dataset['result'])];
        if (!r) return;
        update((s) => {
          s.selectedItem = { name: r.name, rarity: r.rarityKey };
        });
        navigate('detail');
      }),
    );
  },
};
