import { RARITY_COLOR, type Rarity } from '../data';
import { STASH_ITEMS, STASH_TABS } from '../stash';
import { valuation, getHistory, type Snapshot } from '../networth';
import { store, update } from '../store';
import type { View } from '../router';

const RANGE_MS: Record<'24h' | '7d' | '30d', number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};
const RANGE_LABEL: Record<'24h' | '7d' | '30d', string> = {
  '24h': '近 24 小時',
  '7d': '近 7 天',
  '30d': '近 30 天',
};

const CATEGORY_RARITY: Record<string, Rarity> = {
  傳奇: 'unique',
  通貨: 'currency',
  稀有: 'rare',
  其他: 'normal',
};

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 兩種幣別的小計字串（皆 0 時依是否有件數顯示「未估價」/「—」）。 */
function valueText(divine: number, chaos: number, count: number, priced: number): string {
  const parts: string[] = [];
  if (divine > 0) parts.push(`${num(divine)} div`);
  if (chaos > 0) parts.push(`${Math.round(chaos)} c`);
  if (parts.length > 0) return parts.join(' + ');
  return count > 0 && priced === 0 ? '未估價' : '—';
}

/** 單一數列的迷你折線（SVG）；資料 < 2 點時顯示提示。 */
function sparkline(values: number[], color: string): string {
  if (values.length < 2) {
    return `<div class="hand" style="font-size:14px;color:var(--muted-2);padding:10px 0;">資料累積中…（每小時記錄一筆）</div>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 28 - ((v - min) / span) * 26;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:100%;height:48px;display:block;">
    <polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}" vector-effect="non-scaling-stroke" />
  </svg>`;
}

/** 區間內首尾變化百分比。 */
function changePct(values: number[]): number | null {
  if (values.length < 2) return null;
  const a = values[0]!;
  const b = values[values.length - 1]!;
  if (a === 0) return null;
  return ((b - a) / a) * 100;
}

function trendRow(label: string, unit: string, current: number, series: number[], color: string): string {
  const pct = changePct(series);
  const pctStr =
    pct === null
      ? ''
      : `<span class="hand ${pct >= 0 ? 'pos' : ''}" style="font-size:14px;">${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%</span>`;
  return `
    <div style="display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <span class="kicker">${label}走勢</span>
        <span style="font:600 14px/1 var(--sans);">${num(current)} ${unit} ${pctStr}</span>
      </div>
      ${sparkline(series, color)}
    </div>`;
}

export const report: View = {
  render() {
    const v = valuation();
    const range = store.trendRange;
    const cutoff = Date.now() - RANGE_MS[range];
    const points = getHistory(store.league).filter((s: Snapshot) => s.t >= cutoff);
    const divineSeries = points.map((s) => s.divine);
    const chaosSeries = points.map((s) => s.chaos);

    const catRows = v.categories
      .map((c) => {
        const color = RARITY_COLOR[CATEGORY_RARITY[c.label] ?? 'normal'];
        const coverage = c.count > 0 && c.priced > 0 && c.priced < c.count ? ` · ${c.priced} 估` : '';
        return `
      <div class="cur-row">
        <span class="dot" style="background:${color};"></span>
        <span style="flex:1;font:500 13px/1 var(--sans);">${c.label}</span>
        <span class="muted" style="font:500 12px/1 var(--sans);min-width:64px;text-align:right;">${c.count} 件${coverage}</span>
        <span style="font:600 14px/1 var(--sans);min-width:96px;text-align:right;">${valueText(c.divine, c.chaos, c.count, c.priced)}</span>
      </div>`;
      })
      .join('');

    const rangeOpts = (['24h', '7d', '30d'] as const)
      .map((r) => `<option value="${r}" ${r === range ? 'selected' : ''}>${RANGE_LABEL[r]}</option>`)
      .join('');

    return `
      <div class="page-head">
        <span class="num">04</span><span class="ttl">清點彙總 · 總資產報表</span>
        <span class="sub">僅計已估價資產 · 走勢每小時快照</span>
      </div>
      <div class="panel">
        <div class="panel-bar">
          <span class="name">清 點 報 表</span>
          <div style="flex:1;"></div>
          <span class="ink-2" style="font:500 12px/1 var(--sans);">已估價 ${v.pricedItems} 件</span>
        </div>
        <div class="report">
          <div class="kpis">
            <div class="kpi hero">
              <span class="kicker">已估價資產（神聖石）</span>
              <span class="hero-num">${num(v.divine)} <span style="font-size:22px;color:var(--muted-2);">div</span></span>
              <span class="hand" style="font-size:17px;">＋ ${Math.round(v.chaos).toLocaleString('en-US')} c（混沌石計價部分）</span>
            </div>
            <div class="kpi">
              <span class="kicker">已識別物品</span>
              <span class="big">${STASH_ITEMS.length}</span>
              <span class="muted" style="font:500 11px/1.4 var(--sans);">跨 ${STASH_TABS.length} 個倉庫頁</span>
            </div>
            <div class="kpi">
              <span class="kicker">估價覆蓋</span>
              <span class="big">${v.pricedItems}</span>
              <span class="muted" style="font:500 11px/1.4 var(--sans);">件已取得市場價</span>
            </div>
          </div>
          <div class="report-mid">
            <div class="cur-table">
              <div class="panel-bar" style="height:auto;padding:11px 16px;"><span class="kicker">資產分類小計</span></div>
              ${catRows}
              <div class="cur-total">
                <span style="flex:1;font:600 13px/1 var(--sans);">合計</span>
                <span style="font:600 16px/1 var(--sans);">${valueText(v.divine, v.chaos, v.totalItems, v.pricedItems)}</span>
              </div>
            </div>
            <div class="chart">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span class="kicker">總資產走勢</span>
                <select id="rp-range" class="select" style="height:30px;max-width:140px;">${rangeOpts}</select>
              </div>
              ${trendRow('神聖石', 'div', v.divine, divineSeries, '#c8a84b')}
              ${trendRow('混沌石', 'c', v.chaos, chaosSeries, '#9b8f7a')}
            </div>
          </div>
        </div>
      </div>`;
  },

  mount(root) {
    root.querySelector<HTMLSelectElement>('#rp-range')?.addEventListener('change', (e) =>
      update((s) => {
        s.trendRange = (e.target as HTMLSelectElement).value as '24h' | '7d' | '30d';
      }),
    );
  },
};
