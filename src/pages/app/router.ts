import { formatTotal } from './data';
import { store, subscribe } from './store';
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

  return `
    <div class="topbar">
      <div class="glyph"></div>
      <span class="brand">藏 品 庫 · THE RELIQUARY</span>
      <div class="nav">${nav}</div>
      <div class="asset-pill">
        <span class="lbl">總資產</span>
        <span class="val">${formatTotal(store.baseCurrency)}</span>
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

  const content = app.querySelector<HTMLElement>('#content')!;
  const view = routes[route];
  content.innerHTML = view.render();
  view.mount?.(content);
}

export function start(root: HTMLElement): void {
  app = root;
  app.classList.add('app');
  window.addEventListener('hashchange', render);
  subscribe(render); // 任何 store 變更都重繪（含 header 的總資產）
  if (!location.hash) location.hash = '#/overview';
  render();
}
