import { STASH_ITEMS, STASH_TABS } from '../stash';
import { valuation, getHistory, type Snapshot } from '../networth';
import { num } from '../format';
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

/** 快照時刻：當天顯示時:分，跨日加上月/日。 */
function whenText(t: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** 帶正負號的變化量字串（神聖石小數、混沌石整數）。 */
function signed(delta: number, divine: boolean): string {
  if (delta === 0) return '—';
  const mag = divine ? num(Math.abs(delta)) : String(Math.round(Math.abs(delta)));
  return `${delta > 0 ? '＋' : '－'}${mag}`;
}

/** 單一幣別的增減列：色條依幅度縮放、綠（增）／紅（減）。 */
function deltaBar(delta: number, max: number, unit: string, divine: boolean): string {
  const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
  const width = max > 0 ? Math.min(100, (Math.abs(delta) / max) * 100) : 0;
  const amtCls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'muted';
  return `
        <div class="d">
          <span class="track"><span class="fill ${cls}" style="width:${width.toFixed(1)}%;"></span></span>
          <span class="amt ${amtCls}">${signed(delta, divine)}</span>
          <span class="unit">${unit}</span>
        </div>`;
}

/** 一筆快照相對前一筆的增減列（神聖石 + 混沌石）。 */
function deltaRow(
  t: number,
  dDivine: number,
  dChaos: number,
  maxDivine: number,
  maxChaos: number,
): string {
  return `
      <div class="delta-row">
        <span class="when">${whenText(t)}</span>
        <div class="bars-2">
          ${deltaBar(dDivine, maxDivine, 'div', true)}
          ${deltaBar(dChaos, maxChaos, 'c', false)}
        </div>
      </div>`;
}

/** 區間內逐筆快照差（新→舊），及右側欄的增減一覽 HTML。 */
function deltaPanel(points: Snapshot[]): string {
  if (points.length < 2) {
    return `<div class="delta-list"><div class="hand" style="font-size:14px;color:var(--muted-2);padding:16px;">資料累積中…（每小時記錄一筆，至少 2 筆才能比較增減）</div></div>`;
  }
  const deltas = points.slice(1).map((s, i) => ({
    t: s.t,
    dDivine: s.divine - points[i]!.divine,
    dChaos: s.chaos - points[i]!.chaos,
  }));
  const maxDivine = Math.max(...deltas.map((d) => Math.abs(d.dDivine)), 0);
  const maxChaos = Math.max(...deltas.map((d) => Math.abs(d.dChaos)), 0);
  const rows = deltas
    .slice()
    .reverse()
    .map((d) => deltaRow(d.t, d.dDivine, d.dChaos, maxDivine, maxChaos))
    .join('');
  return `<div class="delta-list">${rows}</div>`;
}

/** 區間首尾的淨變化（神聖石 / 混沌石各別）。 */
function netText(points: Snapshot[]): string {
  if (points.length < 2) return '—';
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const dDiv = b.divine - a.divine;
  const dChaos = b.chaos - a.chaos;
  const part = (delta: number, unit: string, divine: boolean): string => {
    const cls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'muted';
    return `<span class="${cls}">${signed(delta, divine)} ${unit}</span>`;
  };
  return `${part(dDiv, 'div', true)} · ${part(dChaos, 'c', false)}`;
}

export const report: View = {
  render() {
    const v = valuation();
    const range = store.trendRange;
    const cutoff = Date.now() - RANGE_MS[range];
    const points = getHistory(store.league).filter((s: Snapshot) => s.t >= cutoff);
    const divineSeries = points.map((s) => s.divine);
    const chaosSeries = points.map((s) => s.chaos);

    const rangeOpts = (['24h', '7d', '30d'] as const)
      .map((r) => `<option value="${r}" ${r === range ? 'selected' : ''}>${RANGE_LABEL[r]}</option>`)
      .join('');

    return `
      <div class="page-head">
        <span class="ttl">清點彙總 · 總資產報表</span>
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
              <div class="panel-bar" style="height:auto;padding:11px 16px;"><span class="kicker">快照增減一覽（新→舊）</span></div>
              ${deltaPanel(points)}
              <div class="cur-total">
                <span style="flex:1;font:600 13px/1 var(--sans);">${RANGE_LABEL[range]}淨變化</span>
                <span style="font:600 15px/1 var(--sans);">${netText(points)}</span>
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

// ── 走勢圖（右欄沿用）────────────────────────────────────────────────────────

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
