// Debug 面板（僅 mode=debug 時啟用）。把主進程轉送的每次官方 API 請求
// （method / url 含 params / request body / 狀態 / 耗時）即時顯示在畫面右下角。
// 自成一塊 DOM 掛在 document.body，獨立於 #app 的換頁重繪，不受影響。
import { esc } from './html';

const MAX_ROWS = 50;
let listEl: HTMLElement | null = null;
let countEl: HTMLElement | null = null;
let count = 0;
let built = false;
const buffer: DebugApiCall[] = []; // 面板建好前先暫存（避免啟動初期的請求漏接）

/** 啟動 debug 面板（非 debug 模式 / 無 bridge 時直接略過）。 */
export async function initDebugPanel(): Promise<void> {
  const bridge = window.debug;
  if (!bridge) return;
  // 先同步訂閱，避免在 enabled() await 期間漏接啟動初期（聯盟/倉庫）的請求。
  bridge.onApiCall((rec) => (built ? addRow(rec) : buffer.push(rec)));
  let on = false;
  try {
    on = await bridge.enabled();
  } catch {
    return;
  }
  if (!on) return; // 非 debug：主進程不會發事件，buffer 永遠為空
  buildPanel();
  built = true;
  for (const rec of buffer) addRow(rec);
  buffer.length = 0;
}

function buildPanel(): void {
  if (document.getElementById('dbgp')) return;

  const style = document.createElement('style');
  style.textContent = `
    #dbgp{position:fixed;right:12px;bottom:12px;width:420px;max-width:46vw;max-height:62vh;z-index:99999;
      display:flex;flex-direction:column;background:#15140f;color:#e7e3d6;border:1px solid #3a382f;border-radius:6px;
      box-shadow:0 8px 30px rgba(0,0,0,.5);font:500 11px/1.5 ui-monospace,'Cascadia Code',Consolas,monospace;}
    #dbgp.min{max-height:none;height:auto;}
    #dbgp .dbgp-hd{display:flex;align-items:center;gap:8px;padding:7px 10px;background:#1f1d16;border-bottom:1px solid #3a382f;
      cursor:default;border-radius:6px 6px 0 0;}
    #dbgp .dbgp-ttl{font-weight:700;letter-spacing:.08em;color:#c8a84b;}
    #dbgp .dbgp-cnt{color:#8a8678;}
    #dbgp .dbgp-grow{flex:1;}
    #dbgp .dbgp-btn{cursor:pointer;background:#2a2820;border:1px solid #44412f;color:#cfc9bd;border-radius:3px;padding:2px 8px;font:inherit;}
    #dbgp .dbgp-btn:hover{background:#34311f;}
    #dbgp .dbgp-list{overflow:auto;padding:6px;}
    #dbgp.min .dbgp-list{display:none;}
    #dbgp .dbgp-row{border:1px solid #2c2a22;border-left-width:3px;border-radius:4px;padding:5px 7px;margin-bottom:6px;background:#1a1913;}
    #dbgp .dbgp-row.ok{border-left-color:#5a8f4b;}
    #dbgp .dbgp-row.err{border-left-color:#b34b4b;}
    #dbgp .dbgp-rowhd{display:flex;align-items:center;gap:7px;}
    #dbgp .dbgp-m{font-weight:700;color:#e7e3d6;}
    #dbgp .dbgp-s.ok{color:#7fc06a;} #dbgp .dbgp-s.err{color:#e08a8a;}
    #dbgp .dbgp-ms,#dbgp .dbgp-time{color:#8a8678;}
    #dbgp .dbgp-url{color:#9fc6e0;word-break:break-all;margin-top:3px;}
    #dbgp .dbgp-sec{color:#c8a84b;margin-top:5px;font-weight:700;}
    #dbgp pre{margin:2px 0 0;white-space:pre-wrap;word-break:break-all;color:#d6d2c4;}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'dbgp';
  panel.innerHTML = `
    <div class="dbgp-hd">
      <span class="dbgp-ttl">DEBUG · API</span>
      <span class="dbgp-cnt" id="dbgp-cnt">0</span>
      <span class="dbgp-grow"></span>
      <button class="dbgp-btn" id="dbgp-clear">清除</button>
      <button class="dbgp-btn" id="dbgp-min">－</button>
    </div>
    <div class="dbgp-list" id="dbgp-list"></div>`;
  document.body.appendChild(panel);

  listEl = panel.querySelector('#dbgp-list');
  countEl = panel.querySelector('#dbgp-cnt');
  panel.querySelector('#dbgp-clear')?.addEventListener('click', () => {
    if (listEl) listEl.innerHTML = '';
    count = 0;
    if (countEl) countEl.textContent = '0';
  });
  panel.querySelector('#dbgp-min')?.addEventListener('click', () => {
    const min = panel.classList.toggle('min');
    const btn = panel.querySelector('#dbgp-min');
    if (btn) btn.textContent = min ? '＋' : '－';
  });
}

/** 時:分:秒。 */
function clock(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 拆出 query params 成可讀字串（無則空）。 */
function paramsBlock(url: string): string {
  try {
    const u = new URL(url);
    const entries = [...u.searchParams.entries()];
    if (entries.length === 0) return '';
    const text = entries.map(([k, v]) => `${k} = ${v}`).join('\n');
    return `<div class="dbgp-sec">params</div><pre>${esc(text)}</pre>`;
  } catch {
    return '';
  }
}

/** body 美化（JSON 可解析則縮排，否則原樣）。 */
function bodyBlock(body: string | null): string {
  if (!body) return '';
  let text = body;
  try {
    text = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    /* 非 JSON：原樣顯示 */
  }
  return `<div class="dbgp-sec">body</div><pre>${esc(text)}</pre>`;
}

/** URL 只留 path（query 另在 params 區顯示），解析失敗則原樣。 */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

function addRow(rec: DebugApiCall): void {
  if (!listEl) return;
  const cls = rec.ok ? 'ok' : 'err';
  const row = document.createElement('div');
  row.className = `dbgp-row ${cls}`;
  row.innerHTML = `
    <div class="dbgp-rowhd">
      <span class="dbgp-m">${esc(rec.method)}</span>
      <span class="dbgp-s ${cls}">${esc(rec.status)}</span>
      <span class="dbgp-ms">${esc(rec.ms)}ms</span>
      <span class="dbgp-grow"></span>
      <span class="dbgp-time">${clock(rec.t)}</span>
    </div>
    <div class="dbgp-url">${esc(pathOf(rec.url))}</div>
    ${paramsBlock(rec.url)}
    ${bodyBlock(rec.body)}`;
  listEl.prepend(row);

  // 限制保留筆數，避免長時間累積。
  while (listEl.children.length > MAX_ROWS) listEl.lastElementChild?.remove();
  count++;
  if (countEl) countEl.textContent = String(count);
}
