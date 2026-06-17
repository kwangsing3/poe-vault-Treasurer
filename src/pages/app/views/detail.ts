import { MODS, PRICE_ROWS, RARITY_COLOR, RARITY_LABEL } from '../data';
import { store } from '../store';
import { navigate } from '../router';
import type { View } from '../router';

export const detail: View = {
  render() {
    const sel = store.selectedItem;
    const name = sel?.name ?? '未選擇物品';
    const color = sel ? RARITY_COLOR[sel.rarity] : '#a39f96';
    const rarity = sel ? RARITY_LABEL[sel.rarity] : '—';
    const base = sel?.base ?? '—';

    const mods = MODS.map(
      (m) => `<div class="mod-row"><span class="pip"></span><span style="font:500 13px/1 var(--sans);">${m}</span></div>`,
    ).join('');

    const prices = PRICE_ROWS.map(
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
        <span class="sub">單件查價 / 擺攤定價</span>
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
            <div class="art">ITEM ART</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <span class="serif" style="font-size:26px;color:${color};">${name}</span>
              <span class="kicker" style="letter-spacing:0.1em;">${rarity} · ${base} · 物品等級 84</span>
            </div>
          </div>
          <div class="detail-data">
            <div style="display:flex;flex-direction:column;gap:8px;">
              <span class="kicker">詞綴</span>
              <div class="mod-list">${mods}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <span class="kicker">比價 · 多來源</span>
              <div class="price-list">${prices}</div>
            </div>
            <div style="margin-top:auto;display:flex;gap:12px;">
              <button class="btn btn-dark" style="flex:1;height:40px;">複製為擺攤定價</button>
              <button class="btn" style="height:40px;">在售 21</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  mount(root) {
    root.querySelector<HTMLElement>('[data-go="overview"]')?.addEventListener('click', () => navigate('overview'));
  },
};
