import type { BaseCurrency } from '../data';
import { STASH_ITEMS, STASH_TABS } from '../stash';
import { relativeTime } from '../format';
import { esc } from '../html';
import { store, update, saveContribute, saveRateLimit } from '../store';
import { switchLeague, syncLeague } from '../router';
import { applyOfficialRateLimit, startContribution, stopContribution } from '../prices';
import type { View } from '../router';

const CURRENCIES: { key: BaseCurrency; label: string }[] = [
  { key: 'C', label: '混沌 C' },
  { key: 'D', label: '神聖 D' },
  { key: 'E', label: '崇高 E' },
];

/** 上次同步的相對時間；尚未同步（null）顯示提示。 */
function lastSyncText(ts: number | null): string {
  return ts === null ? '尚未同步' : relativeTime(ts);
}

// 「立即同步並清點」的冷卻：點擊後禁用 10 秒並在按鈕上倒數。冷卻時間戳存模組層，
// 使狀態能跨頁面重繪存活（router 會在 store 變更 / 同步完成時整段重建 settings DOM）。
const SYNC_LABEL = '立即同步並清點';
const SYNC_COOLDOWN_MS = 10_000;
let syncCooldownUntil = 0;
let cooldownTimer: ReturnType<typeof setInterval> | undefined;

/** 冷卻剩餘秒數（無條件進位；0 表示未在冷卻）。 */
function cooldownLeft(): number {
  return Math.max(0, Math.ceil((syncCooldownUntil - Date.now()) / 1000));
}

/** 同步按鈕當下應顯示的文字（冷卻中附倒數）。 */
function syncLabel(): string {
  const left = cooldownLeft();
  return left > 0 ? `${SYNC_LABEL}（${left}）` : SYNC_LABEL;
}

/**
 * 每秒直接更新按鈕（文字倒數 + 禁用樣式），不整頁重繪——避免沖掉欄位焦點。
 * 同一時刻只保留一個計時器；冷卻結束時自我清除並恢復按鈕。
 */
function startCooldownTicker(): void {
  if (cooldownTimer) return; // 已在跑
  const tick = (): void => {
    const btn = document.querySelector<HTMLButtonElement>('#set-sync');
    if (cooldownLeft() <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = undefined;
      if (btn) {
        btn.disabled = false;
        btn.textContent = SYNC_LABEL;
        btn.style.opacity = '';
        btn.style.cursor = '';
      }
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = syncLabel();
      btn.style.opacity = '.55';
      btn.style.cursor = 'not-allowed';
    }
  };
  tick(); // 立即套用一次
  cooldownTimer = setInterval(tick, 1000);
}

export const settings: View = {
  render() {
    const syncOnCooldown = cooldownLeft() > 0;
    const seg = CURRENCIES.map(
      (c) => `<div class="opt ${store.baseCurrency === c.key ? 'on' : ''}" data-cur="${c.key}">${c.label}</div>`,
    ).join('');

    return `
      <div class="page-head">
        <span class="ttl">設定 · 帳號連接</span>
        <span class="sub">官方 API 自動同步</span>
      </div>
      <div class="panel">
        <div class="panel-bar"><span class="name">設 定</span></div>
        <div class="settings">
          <div class="account">
            <div class="avatar"></div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <span style="font:600 14px/1 var(--sans);">${
                store.authConnected ? `PoE 帳號 · ${esc(store.account ?? '已連結')}` : 'PoE 帳號 · 未連結'
              }</span>
              <span class="${store.authConnected ? 'pos' : 'ink-2'}" style="display:flex;align-items:center;gap:7px;font:500 12px/1 var(--sans);">
                <span style="width:8px;height:8px;border-radius:50%;background:${store.authConnected ? 'var(--pos)' : 'var(--muted)'};"></span>${
                  store.authConnected ? '已連接 · OAuth' : '尚未連接'
                }
              </span>
            </div>
            <div style="flex:1;"></div>
            ${
              store.authConnected
                ? `<button class="btn" id="auth-logout" style="height:auto;padding:8px 14px;">斷開</button>`
                : `<button class="btn btn-dark" id="auth-login" style="height:auto;padding:8px 14px;">連接帳號</button>`
            }
          </div>

          <div style="display:flex;flex-direction:column;gap:16px;">
            <div class="field">
              <span class="label">聯盟</span>
              <select id="set-league" class="select">
                ${store.leagues.map((l) => `<option value="${esc(l)}" ${l === store.league ? 'selected' : ''}>${esc(l)}</option>`).join('')}
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
            <div class="field">
              <span class="label">貢獻查價</span>
              <div style="display:flex;align-items:center;gap:12px;">
                <div class="toggle ${store.contribute ? 'on' : 'off'}" data-contribute><div class="knob"></div></div>
                <span class="ink-2" style="font:500 12px/1 var(--sans);">向指數伺服器領派工、回報查價</span>
              </div>
            </div>
            <div class="field">
              <span class="label">官方查價上限</span>
              <div style="display:flex;align-items:center;gap:10px;">
                <input id="set-rate" type="number" min="0" step="1" value="${store.officialRateLimitPerMin}"
                  class="select" style="width:88px;text-align:right;" />
                <span class="ink-2" style="font:500 12px/1 var(--sans);">件 / 分鐘（0＝不額外限制）</span>
              </div>
            </div>
          </div>

          <div style="margin-top:auto;display:flex;align-items:center;gap:14px;">
            <button class="btn btn-dark" id="set-sync" ${syncOnCooldown ? 'disabled' : ''} style="height:42px;padding:0 24px;${syncOnCooldown ? 'opacity:.55;cursor:not-allowed;' : ''}">${syncLabel()}</button>
            <span class="hand" style="font-size:16px;">目前 ${STASH_ITEMS.length} 件 · 上次同步 · ${lastSyncText(store.lastSync)}</span>
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

    // 貢獻查價開關：持久化並即時起停派工代行。
    root.querySelector<HTMLElement>('[data-contribute]')?.addEventListener('click', () => {
      const on = !store.contribute;
      saveContribute(on);
      if (on) startContribution(store.league);
      else stopContribution();
      update((s) => {
        s.contribute = on;
      });
    });

    // 官方查價速率上限：離開欄位即套用到主進程並持久化。
    root.querySelector<HTMLInputElement>('#set-rate')?.addEventListener('change', (e) => {
      const n = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
      saveRateLimit(n);
      applyOfficialRateLimit(n);
      update((s) => {
        s.officialRateLimitPerMin = n;
      });
    });

    // 立即同步：忽略快取重抓當前聯盟倉庫，完成後更新「上次同步」並重繪。
    // 點擊後禁用按鈕 10 秒（防連點），冷卻狀態存模組層、跨重繪存活。
    const syncBtn = root.querySelector<HTMLButtonElement>('#set-sync');
    syncBtn?.addEventListener('click', () => {
      if (cooldownLeft() > 0) return; // 冷卻中：忽略
      syncCooldownUntil = Date.now() + SYNC_COOLDOWN_MS;
      syncLeague(true);
      startCooldownTicker(); // 立即套用禁用 + 啟動每秒倒數
    });
    // 進入頁面時若仍在冷卻中，續跑倒數讓新按鈕同步顯示並準時恢復。
    if (cooldownLeft() > 0) startCooldownTicker();

    // 連接帳號：開啟 OAuth 流程（系統瀏覽器 + loopback）；成功後寫入 store 並重繪。
    const loginBtn = root.querySelector<HTMLButtonElement>('#auth-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        loginBtn.textContent = '等待授權…';
        loginBtn.disabled = true;
        try {
          const res = await window.auth.login();
          update((s) => {
            s.authConnected = res.connected;
            s.account = res.account ?? null;
          });
        } catch (e) {
          loginBtn.textContent = '連接帳號';
          loginBtn.disabled = false;
          alert(`登入失敗：${e instanceof Error ? e.message : String(e)}`);
        }
      });
    }

    // 斷開：清除本機 token 並更新狀態。
    root.querySelector<HTMLElement>('#auth-logout')?.addEventListener('click', async () => {
      await window.auth.logout();
      update((s) => {
        s.authConnected = false;
        s.account = null;
      });
    });
  },
};
