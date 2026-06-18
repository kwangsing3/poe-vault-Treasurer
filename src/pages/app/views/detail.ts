import { PRICE_ROWS, RARITY_COLOR, RARITY_LABEL } from '../data';
import { store } from '../store';
import { formatChaos } from '../stash';
import {
  formatPrice,
  formatListing,
  priceLinesHTML,
  priceStateFor,
  requestPrice,
  keyOf,
  setPriceResolveHook,
} from '../prices';
import { navigate } from '../router';
import type { View } from '../router';

export const detail: View = {
  render() {
    const sel = store.selectedItem;
    const name = sel?.name ?? '未選擇物品';
    const color = sel ? RARITY_COLOR[sel.rarity] : '#a39f96';
    const rarity = sel ? RARITY_LABEL[sel.rarity] : '—';
    const base = sel?.base ?? '—';
    const ilvlText = sel?.ilvl ? ` · 物品等級 ${sel.ilvl}` : '';
    const valueText =
      sel && sel.value !== undefined
        ? sel.stack !== undefined
          ? `${formatChaos(sel.value)} / 個 · ×${sel.stack.toLocaleString('en-US')}`
          : formatChaos(sel.value)
        : '—';

    const modList = sel?.mods ?? [];
    const mods = modList.length
      ? modList
          .map(
            (m) => `<div class="mod-row"><span class="pip"></span><span style="font:500 13px/1 var(--sans);">${m}</span></div>`,
          )
          .join('')
      : `<div class="mod-row"><span style="font:500 13px/1 var(--sans);color:var(--muted-2);">此物品無詞綴</span></div>`;

    const art = sel?.icon
      ? `<div class="art has-img"><img src="${sel.icon}" alt="${name}" /></div>`
      : `<div class="art">ITEM ART</div>`;

    // 傳奇：顯示實際取樣到的掛單清單；其餘維持原 mock 比價列。
    const priceState = sel?.rarity === 'unique' ? priceStateFor(sel.name, sel.base) : undefined;
    const hasQuote = priceState !== undefined && priceState !== 'loading' && priceState !== 'unknown';
    const priceTitle =
      sel?.rarity === 'unique'
        ? `市場掛單${hasQuote ? ` · 取樣 ${priceState.listings.length} 筆` : ''}`
        : '比價 · 多來源（mock）';
    const prices = hasQuote
      ? priceState.listings
          .map(
            (l, i) => `
      <div class="price-row">
        <span class="ink-2" style="font:500 13px/1 var(--sans);">#${i + 1}</span>
        <span class="hand" style="font-size:15px;flex:1;text-align:right;padding-right:18px;"></span>
        <span style="font:600 16px/1 var(--sans);min-width:78px;text-align:right;">${formatListing(l)}</span>
      </div>`,
          )
          .join('')
      : sel?.rarity === 'unique'
        ? `<div class="price-row"><span class="ink-2" style="font:500 13px/1 var(--sans);">${formatPrice(priceState)}</span></div>`
        : PRICE_ROWS.map(
            (p) => `
      <div class="price-row">
        <span class="ink-2" style="font:500 13px/1 var(--sans);">${p.src}</span>
        <span class="hand" style="font-size:15px;flex:1;text-align:right;padding-right:18px;">${p.hint}</span>
        <span style="font:600 16px/1 var(--sans);min-width:78px;text-align:right;">${p.price}</span>
      </div>`,
          ).join('');

    return `
      <div class="page-head">
        <span class="num">02</span><span class="ttl">物品詳情 · 展櫃</span>
        <span class="sub">單件查價</span>
      </div>
      <div class="panel">
        <div class="panel-bar">
          <div class="topbar-glyph" style="width:11px;height:11px;border-radius:50%;border:1.5px solid var(--ink);"></div>
          <span class="ink-2" data-go="overview" style="font:500 12px/1 var(--sans);cursor:pointer;">← 返回網格</span>
          <div style="flex:1;"></div>
          <span class="serif" style="font-size:16px;color:${color};">${name}</span>
        </div>
        <div class="detail">
          <div class="detail-art">
            ${art}
            <div style="display:flex;flex-direction:column;gap:6px;">
              <span class="serif" style="font-size:26px;color:${color};">${name}</span>
              <span class="kicker" style="letter-spacing:0.1em;">${rarity} · ${base}${ilvlText}</span>
            </div>
          </div>
          <div class="detail-data">
            <div style="display:flex;flex-direction:column;gap:8px;">
              <span class="kicker">詞綴</span>
              <div class="mod-list">${mods}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <span class="kicker">${priceTitle}</span>
              <div class="price-list">${prices}</div>
            </div>
            <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px;">
              <span class="ink-2" style="font:500 13px/1 var(--sans);">估值（mock） · ${valueText}</span>
              ${
                sel?.rarity === 'unique'
                  ? `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                      <div style="display:flex;flex-direction:column;gap:4px;">
                        <span class="kicker">市場價（中位數）</span>
                        <div style="font:600 15px/1.35 var(--sans);">${priceLinesHTML(priceState)}</div>
                      </div>
                      <button class="btn" id="dt-reprice" style="height:32px;align-self:flex-start;">重新查價</button>
                    </div>`
                  : ''
              }
            </div>
          </div>
        </div>
      </div>`;
  },

  mount(root) {
    root.querySelector<HTMLElement>('[data-go="overview"]')?.addEventListener('click', () => navigate('overview'));

    const sel = store.selectedItem;

    // 就地重繪詳情內容（價格更新 / 重新查價後刷新，不動到整頁、不重置捲動）。
    const rerender = () => {
      const panel = (root.closest('#content') as HTMLElement | null) ?? root;
      panel.innerHTML = this.render();
      this.mount?.(panel);
    };

    // 「重新查價」：插到佇列最前，立即啟動；按鈕標記查價中。
    const btn = root.querySelector<HTMLButtonElement>('#dt-reprice');
    if (btn && sel) {
      btn.addEventListener('click', () => {
        requestPrice(sel.name, sel.base);
        btn.textContent = '查價中…';
        btn.disabled = true;
      });
    }

    // 當前物品的估價更新時就地刷新。
    if (sel?.rarity === 'unique') {
      setPriceResolveHook((key) => {
        if (key === keyOf(sel.name, sel.base)) rerender();
      });
    }
  },
};
