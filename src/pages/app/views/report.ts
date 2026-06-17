import { buildHistoryBars, CURRENCY_META, RARITY_COLOR, TOTAL_DIV } from '../data';
import {
  STASH_ITEMS,
  STASH_TABS,
  formatChaos,
  formatStashTotal,
  itemTotalChaos,
} from '../stash';
import { store } from '../store';
import type { View } from '../router';

const bars = buildHistoryBars();

/** 聚合當前聯盟的通貨類物品：依名稱合併、加總堆疊與估值，依總值排序。 */
function currencyBreakdown(): { name: string; count: number; chaos: number }[] {
  const acc = new Map<string, { name: string; count: number; chaos: number }>();
  for (const it of STASH_ITEMS) {
    if (it.rarity !== 'currency') continue;
    const row = acc.get(it.name) ?? { name: it.name, count: 0, chaos: 0 };
    row.count += it.stack ?? 1;
    row.chaos += itemTotalChaos(it);
    acc.set(it.name, row);
  }
  return [...acc.values()].sort((a, b) => b.chaos - a.chaos);
}

export const report: View = {
  render() {
    const meta = CURRENCY_META[store.baseCurrency];
    const total = formatStashTotal(store.baseCurrency).replace('≈ ', '');

    const breakdown = currencyBreakdown();
    const curTotalChaos = breakdown.reduce((s, c) => s + c.chaos, 0);
    const curRows = breakdown
      .slice(0, 12)
      .map(
        (c) => `
      <div class="cur-row">
        <span class="dot" style="background:${RARITY_COLOR.currency};"></span>
        <span style="flex:1;font:500 13px/1 var(--sans);">${c.name}</span>
        <span class="muted" style="font:500 12px/1 var(--sans);min-width:54px;text-align:right;">×${c.count.toLocaleString('en-US')}</span>
        <span style="font:600 14px/1 var(--sans);min-width:74px;text-align:right;">${formatChaos(c.chaos)}</span>
      </div>`,
      )
      .join('') || '<div class="cur-row"><span class="muted" style="font:500 12px/1 var(--sans);">此聯盟尚無通貨資料</span></div>';

    const chartBars = bars
      .map((b) => `<div class="bar ${b.peak ? 'peak' : ''}" style="height:${b.h}%;"></div>`)
      .join('');

    return `
      <div class="page-head">
        <span class="num">04</span><span class="ttl">清點彙總 · 總資產報表</span>
        <span class="sub">含近 30 天走勢</span>
      </div>
      <div class="panel">
        <div class="panel-bar">
          <span class="name">清 點 報 表</span>
          <div style="flex:1;"></div>
          <span class="ink-2" style="font:500 12px/1 var(--sans);">基準通貨 · ${meta.label}</span>
        </div>
        <div class="report">
          <div class="kpis">
            <div class="kpi hero">
              <span class="kicker">總資產估值</span>
              <span class="hero-num">${total.split(' ')[0]} <span style="font-size:22px;color:var(--muted-2);">${meta.unit}</span></span>
              <span class="hand pos" style="font-size:17px;">↑ +38.6 div · 近 30 天 +10.3%</span>
            </div>
            <div class="kpi">
              <span class="kicker">已識別物品</span>
              <span class="big">${STASH_ITEMS.length}</span>
              <span class="muted" style="font:500 11px/1.4 var(--sans);">跨 ${STASH_TABS.length} 個倉庫頁</span>
            </div>
            <div class="kpi">
              <span class="kicker">可擺攤</span>
              <span class="big">126</span>
              <span class="muted" style="font:500 11px/1.4 var(--sans);">已定價 · 一鍵匯出</span>
            </div>
          </div>
          <div class="report-mid">
            <div class="cur-table">
              <div class="panel-bar" style="height:auto;padding:11px 16px;"><span class="kicker">通貨拆分</span></div>
              ${curRows}
              <div class="cur-total">
                <span style="flex:1;font:600 13px/1 var(--sans);">合計（折 ${meta.unit}）</span>
                <span style="font:600 16px/1 var(--sans);">${((curTotalChaos / CURRENCY_META.C.perDiv) * meta.perDiv).toLocaleString('en-US', { maximumFractionDigits: meta.perDiv === 1 ? 1 : 0 })} ${meta.unit}</span>
              </div>
            </div>
            <div class="chart">
              <div style="display:flex;align-items:baseline;justify-content:space-between;">
                <span class="kicker">近 30 天總資產走勢 (div)</span>
                <span class="hand" style="font-size:16px;">30D · 峰值 ${TOTAL_DIV} div</span>
              </div>
              <div class="bars">${chartBars}</div>
              <div class="chart-x"><span>30 天前</span><span>15 天前</span><span>今天</span></div>
            </div>
          </div>
        </div>
      </div>`;
  },
};
