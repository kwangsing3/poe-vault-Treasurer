import {
  buildHistoryBars,
  CURRENCY_META,
  CURRENCY_ROWS,
  formatTotal,
  RARITY_COLOR,
  TOTAL_DIV,
} from '../data';
import { store } from '../store';
import type { View } from '../router';

const bars = buildHistoryBars();

export const report: View = {
  render() {
    const meta = CURRENCY_META[store.baseCurrency];
    const total = formatTotal(store.baseCurrency).replace('≈ ', '');

    const curRows = CURRENCY_ROWS.map(
      (c) => `
      <div class="cur-row">
        <span class="dot" style="background:${RARITY_COLOR[c.rarityKey]};"></span>
        <span style="flex:1;font:500 13px/1 var(--sans);">${c.name}</span>
        <span class="muted" style="font:500 12px/1 var(--sans);min-width:54px;text-align:right;">×${c.count}</span>
        <span style="font:600 14px/1 var(--sans);min-width:74px;text-align:right;">${c.value}</span>
      </div>`,
    ).join('');

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
              <span class="big">482</span>
              <span class="muted" style="font:500 11px/1.4 var(--sans);">跨 8 個倉庫頁</span>
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
                <span style="font:600 16px/1 var(--sans);">${(154.9 * meta.perDiv).toLocaleString('en-US', { maximumFractionDigits: meta.perDiv === 1 ? 1 : 0 })} ${meta.unit}</span>
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
