import { formatStashTotal } from './stash';
import { store, subscribe, update } from './store';
import { overview } from './views/overview';
import { detail } from './views/detail';
import { search } from './views/search';
import { report } from './views/report';
import { settings } from './views/settings';

export interface View {
  render(): string;
  mount?(root: HTMLElement): void;
}

export type Route = 'overview' | 'detail' | 'search' | 'report' | 'settings';

const NAV: { route: Route; label: string }[] = [
  { route: 'overview', label: '總覽' },
  { route: 'detail', label: '詳情' },
  { route: 'search', label: '搜尋' },
  { route: 'report', label: '報表' },
  { route: 'settings', label: '設定' },
];

const routes: Record<Route, View> = { overview, detail, search, report, settings };

function currentRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '') as Route;
  return hash in routes ? hash : 'overview';
}

/** 切換頁面：只改 hash，實際重繪交給 hashchange */
export function navigate(route: Route): void {
  location.hash = `#/${route}`;
}

function topbar(route: Route): string {
  const nav = NAV.map(
    (n) => `<button class="nav-btn ${n.route === route ? 'active' : ''}" data-nav="${n.route}">${n.label}</button>`,
  ).join('');

  const leagueOpts = store.leagues
    .map((l) => `<option value="${l}" ${l === store.league ? 'selected' : ''}>${l}</option>`)
    .join('');

  return `
    <div class="topbar">
      <div class="glyph"></div>
      <span class="brand">藏 品 庫 · THE RELIQUARY</span>
      <div class="nav">${nav}</div>
      <label class="league">
        <span class="league-lbl">聯盟</span>
        <select id="league-sel" class="league-sel">${leagueOpts}</select>
      </label>
      <div class="asset-pill">
        <span class="lbl">總資產</span>
        <span class="val">${formatStashTotal(store.baseCurrency)}</span>
      </div>
    </div>`;
}

let app: HTMLElement;

function render(): void {
  const route = currentRoute();
  app.innerHTML = `${topbar(route)}<div class="content" id="content"></div>`;

  app.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => navigate(el.dataset['nav'] as Route)),
  );

  app.querySelector<HTMLSelectElement>('#league-sel')?.addEventListener('change', (e) =>
    update((s) => (s.league = (e.target as HTMLSelectElement).value)),
  );

  const content = app.querySelector<HTMLElement>('#content')!;
  const view = routes[route];
  content.innerHTML = view.render();
  view.mount?.(content);
}

/**
 * 啟動時載入聯盟清單。
 * 未連結帳號 → 抓公用端點（經主進程，避開 CORS）；連結帳號後改優先用 account 資訊（待實作）。
 * 抓取失敗則沿用 store 的離線後備清單。
 */
async function loadLeagues(): Promise<void> {
  const list = await window.poe?.getLeagues();
  if (!list || list.length === 0) return;
  const names = list.map((l) => l.text);
  update((s) => {
    s.leagues = names;
    if (!names.includes(s.league)) s.league = names[0]!;
  });
}

export function start(root: HTMLElement): void {
  app = root;
  app.classList.add('app');
  window.addEventListener('hashchange', render);
  subscribe(render); // 任何 store 變更都重繪（含 header 的總資產）
  if (!location.hash) location.hash = '#/overview';
  render();
  void loadLeagues();
}
