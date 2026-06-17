import type { BaseCurrency } from '../data';
import { STASH_ITEMS, STASH_TABS } from '../stash';
import { store, update } from '../store';
import { switchLeague, syncLeague } from '../router';
import type { View } from '../router';

const CURRENCIES: { key: BaseCurrency; label: string }[] = [
  { key: 'C', label: '混沌 C' },
  { key: 'D', label: '神聖 D' },
  { key: 'E', label: '崇高 E' },
];

/** 把時間戳格式化成「N 分鐘前」等相對時間。 */
function relativeTime(ts: number | null): string {
  if (ts === null) return '尚未同步';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return '剛剛';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}

export const settings: View = {
  render() {
    const seg = CURRENCIES.map(
      (c) => `<div class="opt ${store.baseCurrency === c.key ? 'on' : ''}" data-cur="${c.key}">${c.label}</div>`,
    ).join('');

    return `
      <div class="page-head">
        <span class="num">05</span><span class="ttl">設定 · 帳號連接</span>
        <span class="sub">官方 API 自動同步</span>
      </div>
      <div class="panel">
        <div class="panel-bar"><span class="name">設 定</span></div>
        <div class="settings">
          <div class="account">
            <div class="avatar"></div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <span style="font:600 14px/1 var(--sans);">PoE 帳號 · Exile#1234</span>
              <span class="pos" style="display:flex;align-items:center;gap:7px;font:500 12px/1 var(--sans);">
                <span style="width:8px;height:8px;border-radius:50%;background:var(--pos);"></span>已連接 · OAuth
              </span>
            </div>
            <div style="flex:1;"></div>
            <button class="btn" style="height:auto;padding:8px 14px;">斷開</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:16px;">
            <div class="field">
              <span class="label">聯盟</span>
              <select id="set-league" class="select">
                ${store.leagues.map((l) => `<option value="${l}" ${l === store.league ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <span class="label">同步的倉庫頁</span>
              <div style="flex:1;display:flex;gap:8px;flex-wrap:wrap;">
                <span class="chip on">全部 ${STASH_TABS.length} 頁</span>
                <span class="chip" style="border-style:dashed;">自訂…</span>
              </div>
            </div>
            <div class="field">
              <span class="label">基準通貨</span>
              <div class="seg">${seg}</div>
            </div>
            <div class="field">
              <span class="label">自動同步</span>
              <div style="display:flex;align-items:center;gap:12px;">
                <div class="toggle ${store.autoSync ? 'on' : 'off'}" data-toggle><div class="knob"></div></div>
                <span class="ink-2" style="font:500 12px/1 var(--sans);">每 10 分鐘 · 僅前景</span>
              </div>
            </div>
          </div>

          <div style="margin-top:auto;display:flex;align-items:center;gap:14px;">
            <button class="btn btn-dark" id="set-sync" style="height:42px;padding:0 24px;">立即同步並清點</button>
            <span class="hand" style="font-size:16px;">目前 ${STASH_ITEMS.length} 件 · 上次同步 · ${relativeTime(store.lastSync)}</span>
          </div>
        </div>
      </div>`;
  },

  mount(root) {
    root.querySelectorAll<HTMLElement>('[data-cur]').forEach((el) =>
      el.addEventListener('click', () =>
        update((s) => {
          s.baseCurrency = el.dataset['cur'] as BaseCurrency;
        }),
      ),
    );

    root.querySelector<HTMLSelectElement>('#set-league')?.addEventListener('change', (e) =>
      switchLeague((e.target as HTMLSelectElement).value),
    );

    root.querySelector<HTMLElement>('[data-toggle]')?.addEventListener('click', () =>
      update((s) => {
        s.autoSync = !s.autoSync;
      }),
    );

    // 立即同步：忽略快取重抓當前聯盟倉庫，完成後更新「上次同步」並重繪。
    root.querySelector<HTMLElement>('#set-sync')?.addEventListener('click', () => syncLeague(true));
  },
};
