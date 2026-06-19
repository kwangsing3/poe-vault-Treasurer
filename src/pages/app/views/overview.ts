import { PRICE_ROWS, RARITY_COLOR, RARITY_LABEL } from '../data';
import {
  STASH_ITEMS,
  STASH_TABS,
  formatChaos,
  formatStashTotal,
  isGridTab,
  searchItems,
  tabItems,
  tabLayout,
  tabSize,
  type LayoutSlot,
  type StashItem,
  type StashLayout,
} from '../stash';
import { store, toSelected } from '../store';
import {
  priceLinesHTML, priceStateFor, keyOf, setPriceResolveHook,
  formatPrice, priceTagHTML, requestPrice,
} from '../prices';
import type { View } from '../router';

const QUAD_CELL = 30; // px
const NORMAL_CELL = 46; // px

// 倉庫類型 → 短標籤（顯示在分頁籤上，標註該頁的倉庫類型）。
const TYPE_LABEL: Record<string, string> = {
  NormalStash: '一般',
  PremiumStash: '高級',
  QuadStash: '巨型',
  CurrencyStash: '通貨',
  FragmentStash: '碎片',
  MapStash: '地圖',
  EssenceStash: '精華',
  DivinationCardStash: '命運',
  DeliriumStash: '譫妄',
  UltimatumStash: '通牒',
  BlightStash: '凋落',
  DelveStash: '化石',
  UniqueStash: '傳奇',
  GemStash: '寶石',
  FlaskStash: '藥劑',
};
function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? '其他';
}

// ── 特殊分頁版面（Phase A：先做通貨）──────────────────────────────────────
// 依回應內附的 layout（slot 像素座標）絕對定位物品；分多個 section 者提供子頁切換。
const LAYOUT_TYPES = new Set(['CurrencyStash']);
const LAYOUT_CELL = 64; // 版面像素座標的基準格大小（× slot.scale = 實際格大小）
const SECTION_LABEL: Record<string, string> = {
  general: '一般',
  influence: '勢力',
  league: '聯盟',
};
function sectionLabel(s: string): string {
  return SECTION_LABEL[s] ?? s;
}

// 各分頁目前選中的 section（子頁），切換倉庫頁不影響彼此。
const sectionState = new Map<number, string>();
function activeSection(tab: number, layout: StashLayout): string | null {
  if (layout.sections.length === 0) return null;
  const cur = sectionState.get(tab);
  return cur && layout.sections.includes(cur) ? cur : layout.sections[0]!;
}

function layoutHTML(tab: number, layout: StashLayout): string {
  const sec = activeSection(tab, layout);
  const first = layout.sections[0];
  // 無 section 欄位的 slot 歸到第一個子頁；無分區時全部顯示。
  const inSection = (s: LayoutSlot): boolean =>
    sec === null ? true : (s.section ?? first) === sec;

  const bySlot = new Map<string, StashItem>();
  for (const it of tabItems(tab)) bySlot.set(String(it.x), it);

  const selName = store.selectedItem?.name;
  // 先收集本子頁有物品的格子，算出內容邊界（含 min）。
  const filled = Object.entries(layout.slots)
    .filter(([idx, s]) => inSection(s) && bySlot.has(idx))
    .map(([idx, s]) => ({
      it: bySlot.get(idx)!,
      x: s.x,
      y: s.y,
      w: LAYOUT_CELL * s.w * s.scale,
      h: LAYOUT_CELL * s.h * s.scale,
    }));

  let minX = Infinity;
  let minY = Infinity;
  let maxR = 0;
  let maxB = 0;
  for (const c of filled) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxR = Math.max(maxR, c.x + c.w);
    maxB = Math.max(maxB, c.y + c.h);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
  }

  // 整體位移到左上、容器收緊到內容範圍，避免右下大片空白。
  const cells = filled.map((c) => {
    const inner = `<img src="${c.it.icon}" alt="${c.it.name}" loading="lazy" />${c.it.stack !== undefined ? `<span class="stack">${c.it.stack}</span>` : ''}`;
    const sel = c.it.name === selName ? ' sel' : '';
    return `<div class="lay-slot${sel}" data-id="${c.it.id}" title="${c.it.name}" style="left:${(c.x - minX).toFixed(1)}px;top:${(c.y - minY).toFixed(1)}px;width:${c.w.toFixed(1)}px;height:${c.h.toFixed(1)}px;"><div class="lay-frame"></div>${inner}</div>`;
  });

  const pills =
    layout.sections.length > 1
      ? `<div class="lay-sections">${layout.sections
          .map((n) => `<span class="lay-pill ${n === sec ? 'on' : ''}" data-section="${n}">${sectionLabel(n)}</span>`)
          .join('')}</div>`
      : '';

  return `<div class="layout-wrap">
    ${pills}
    <div class="real-grid lay-grid" style="width:${Math.ceil(maxR - minX)}px;height:${Math.ceil(maxB - minY)}px;">${cells.join('')}</div>
  </div>`;
}

function isSearching(): boolean {
  return store.searchQuery.trim().length > 0;
}

function itemHTML(it: StashItem, positioned: boolean): string {
  const sel = it.name === store.selectedItem?.name ? 'sel' : '';
  const pos = positioned
    ? `grid-column:${it.x + 1}/span ${it.w};grid-row:${it.y + 1}/span ${it.h};`
    : '';
  const stack = it.stack !== undefined ? `<span class="stack">${it.stack}</span>` : '';
  return `<div class="gitem ${sel}" style="${pos}--rc:${RARITY_COLOR[it.rarity]};" data-id="${it.id}" data-rarity="${it.rarity}" title="${it.name}">
    <img src="${it.icon}" alt="${it.name}" loading="lazy" />${stack}
  </div>`;
}

function gridHTML(): string {
  const tab = store.activeTab;
  const n = tabSize(tab);
  const cell = n >= 24 ? QUAD_CELL : NORMAL_CELL;

  if (isSearching()) {
    const found = searchItems(store.searchQuery);
    const items = found.map((it) => itemHTML(it, false)).join('');
    return `<div class="real-grid search" style="--cell:${NORMAL_CELL}px;--n:12;">
      <div class="rg-flow">${items || '<span class="rg-empty">沒有符合的物品</span>'}</div>
    </div>`;
  }

  // 特殊分頁版面（Phase A：通貨）——依回應 layout 絕對定位，只畫有物品的格子。
  // 空頁（該聯盟此分頁無物品）則 fall through 到下方的空頁網格 + 提示。
  const tabMeta = STASH_TABS.find((x) => x.i === tab);
  const layout = tabLayout(tab);
  if (
    layout &&
    tabMeta &&
    LAYOUT_TYPES.has(tabMeta.type) &&
    Object.keys(layout.slots).length > 0 &&
    tabItems(tab).length > 0
  ) {
    return layoutHTML(tab, layout);
  }

  const items = tabItems(tab);
  const bg = Array.from({ length: n * n }, () => '<div class="gcell"></div>').join('');

  // 空頁：仍畫出倉庫網格（依分頁尺寸），疊上提示——讓空分頁看起來仍是一個倉庫。
  if (items.length === 0) {
    return `<div class="real-grid" style="--cell:${cell}px;--n:${n};">
      <div class="rg-bg">${bg}</div>
      <div class="rg-hint">此頁沒有物品</div>
    </div>`;
  }

  // 特殊分頁（通貨/碎片/卡…）座標非格線，有物品時改用 flow 排列。
  if (!isGridTab(tab)) {
    const flow = items.map((it) => itemHTML(it, false)).join('');
    return `<div class="real-grid search" style="--cell:${NORMAL_CELL}px;--n:12;">
      <div class="rg-flow">${flow}</div>
    </div>`;
  }

  const gitems = items.map((it) => itemHTML(it, true)).join('');
  return `<div class="real-grid" style="--cell:${cell}px;--n:${n};">
    <div class="rg-bg">${bg}</div>
    <div class="rg-items">${gitems}</div>
  </div>`;
}

function footerHTML(): string {
  if (isSearching()) {
    const found = searchItems(store.searchQuery);
    return `符合「${store.searchQuery.trim()}」· ${found.length} 件 · 全庫 ${STASH_ITEMS.length} 件 · 估值合計 ${formatStashTotal(store.baseCurrency)}`;
  }
  const t = STASH_TABS.find((x) => x.i === store.activeTab);
  const items = tabItems(store.activeTab);
  let label: string;
  if (t) {
    const tl = typeLabel(t.type);
    // 分頁名與類型相同時不重複顯示；網格類分頁才標尺寸（特殊分頁無格線概念）。
    const name = t.n === tl ? tl : `${t.n} · ${tl}`;
    const size = isGridTab(t.i) ? ` · ${tabSize(t.i)}×${tabSize(t.i)}` : '';
    label = `${name}${size}`;
  } else {
    label = `分頁 ${store.activeTab}`;
  }
  return `${label} · ${items.length} 件 · 全庫 ${STASH_ITEMS.length} 件 · 估值合計 ${formatStashTotal(store.baseCurrency)}`;
}

/** 銘牌內層（不含 .plaque 外殼），供就地刷新而不重建外層元素。
 *  已整合原「物品詳情」頁內容：詞綴 + 市場掛單/比價 + 估值 + 重新查價。 */
function plaqueInner(): string {
  const sel = store.selectedItem;
  if (!sel) {
    return `
      <span class="kicker">選中物品 · 詳情</span>
      <div class="art">ITEM ART</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        <span class="serif" style="font-size:21px;color:#cdc9c0;">未選擇</span>
        <span class="kicker" style="letter-spacing:0.08em;">— · —</span>
      </div>
      <div class="divider"></div>
      <span class="ink-2" style="font:500 13px/1.6 var(--sans);">點左側網格中的物品，這裡顯示詞綴與查價。</span>`;
  }

  const color = RARITY_COLOR[sel.rarity];
  const rarity = RARITY_LABEL[sel.rarity];
  const ilvlText = sel.ilvl ? ` · 物品等級 ${sel.ilvl}` : '';
  const art = sel.icon
    ? `<div class="art has-img"><img src="${sel.icon}" alt="${sel.name}" /></div>`
    : `<div class="art">ITEM ART</div>`;
  const valueText =
    sel.value !== undefined
      ? sel.stack !== undefined
        ? `${formatChaos(sel.value)} / 個 · ×${sel.stack.toLocaleString('en-US')}`
        : formatChaos(sel.value)
      : '—';

  // 詞綴
  const modList = sel.mods ?? [];
  const mods = modList.length
    ? modList
        .map((m) => `<div class="mod-row"><span class="pip"></span><span style="font:500 13px/1 var(--sans);">${m}</span></div>`)
        .join('')
    : `<div class="mod-row"><span style="font:500 13px/1 var(--sans);color:var(--muted-2);">此物品無詞綴</span></div>`;

  // 價格：傳奇顯示實際取樣到的掛單；其餘維持 mock 比價列。
  const priceState = sel.rarity === 'unique' ? priceStateFor(sel.name, sel.base) : undefined;
  const hasQuote = priceState !== undefined && priceState !== 'loading' && priceState !== 'unknown';
  const priceTitle =
    sel.rarity === 'unique'
      ? `市場掛單${hasQuote ? ` · 取樣 ${priceState.listings.length} 筆` : ''}`
      : '比價 · 多來源（mock）';
  let prices: string;
  if (hasQuote) {
    // 同一標價聚合：相同（金額 + 幣別）的掛單合併成一列，標出筆數。
    const byPrice = new Map<string, { amount: number; currency: string; n: number }>();
    for (const l of priceState.listings) {
      const k = `${l.amount}|${l.currency}`;
      const g = byPrice.get(k);
      if (g) g.n++;
      else byPrice.set(k, { amount: l.amount, currency: l.currency, n: 1 });
    }
    prices = [...byPrice.values()]
      .map(
        (g) => `
      <div class="price-row">
        <span style="font:600 15px/1.2 var(--sans);">${priceTagHTML(g.amount, g.currency)}</span>
        <span class="ink-2" style="font:500 13px/1 var(--sans);">${g.n} 筆</span>
      </div>`,
      )
      .join('');
  } else if (sel.rarity === 'unique') {
    prices = `<div class="price-row"><span class="ink-2" style="font:500 13px/1 var(--sans);">${formatPrice(priceState)}</span></div>`;
  } else {
    prices = PRICE_ROWS.map(
      (p) => `
      <div class="price-row">
        <span class="ink-2" style="font:500 13px/1 var(--sans);">${p.src}</span>
        <span style="font:600 15px/1 var(--sans);min-width:78px;text-align:right;">${p.price}</span>
      </div>`,
    ).join('');
  }

  const marketBlock =
    sel.rarity === 'unique'
      ? `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span class="kicker">市場價（中位數）</span>
          <div style="font:600 14px/1.35 var(--sans);">${priceLinesHTML(priceState)}</div>
        </div>
        <button class="btn" id="ov-reprice" style="height:30px;align-self:flex-start;">重新查價</button>
      </div>`
      : '';

  return `
      <span class="kicker">選中物品 · 詳情</span>
      ${art}
      <div style="display:flex;flex-direction:column;gap:5px;">
        <span class="serif" style="font-size:21px;color:${color};">${sel.name}</span>
        <span class="kicker" style="letter-spacing:0.08em;">${rarity} · ${sel.base ?? '—'}${ilvlText}</span>
      </div>
      <div class="divider"></div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="kicker">詞綴</span>
        <div class="mod-list">${mods}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="kicker">${priceTitle}</span>
        <div class="price-list">${prices}</div>
      </div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;">
        <span class="ink-2" style="font:500 12px/1 var(--sans);">估值（mock）</span>
        <span style="font:600 16px/1 var(--sans);">${valueText}</span>
      </div>
      ${marketBlock}`;
}

function plaque(): string {
  return `<div class="plaque" id="ov-plaque">${plaqueInner()}</div>`;
}

export const overview: View = {
  render() {
    const tabs = STASH_TABS.map((t) => {
      const active = t.i === store.activeTab && !isSearching() ? 'active' : '';
      const dot = `rgb(${t.r},${t.g},${t.b})`;
      const badge = `<span class="badge ${t.quad ? 'badge-quad' : ''}">${typeLabel(t.type)}</span>`;
      return `<div class="tab-item ${active}" data-tab="${t.i}">
        <span class="sq" style="background:${dot};"></span><span class="tn">${t.n}</span>${badge}
      </div>`;
    }).join('');

    return `
      <div class="page-head">
        <span class="ttl">倉庫總覽 · Stash 網格</span>
        <span class="sub">一眼看清整庫存貨</span>
      </div>
      <div class="panel">
        <div class="overview">
          <div class="tab-rail">
            <span class="lbl">倉庫頁 · ${STASH_TABS.length}</span>
            ${tabs}
          </div>
          <div class="grid-area">
            <div class="grid-tools">
              <input class="search-box" id="ov-search" placeholder="⌕  搜尋物品 / 基底…" />
              <div class="btn" style="height:30px;">價值 ↓</div>
            </div>
            <div class="grid-wrap" id="ov-grid">${gridHTML()}</div>
            <div class="hand" id="ov-footer" style="font-size:16px;">${footerHTML()}</div>
          </div>
          ${plaque()}
        </div>
      </div>`;
  },

  mount(root) {
    const gridEl = root.querySelector<HTMLElement>('#ov-grid');
    const footerEl = root.querySelector<HTMLElement>('#ov-footer');
    const plaqueEl = root.querySelector<HTMLElement>('#ov-plaque');

    // 就地刷新銘牌（重新查價按鈕在銘牌內，重繪後需重新綁定）。
    const refreshPlaque = () => {
      if (!plaqueEl) return;
      plaqueEl.innerHTML = plaqueInner();
      const reprice = plaqueEl.querySelector<HTMLButtonElement>('#ov-reprice');
      const sel = store.selectedItem;
      if (reprice && sel) {
        reprice.addEventListener('click', () => {
          requestPrice(sel.name, sel.base);
          reprice.textContent = '查價中…';
          reprice.disabled = true;
        });
      }
    };

    const wireCells = () => {
      gridEl?.querySelectorAll<HTMLElement>('[data-id]').forEach((el) =>
        el.addEventListener('click', () => {
          const it = STASH_ITEMS.find((x) => x.id === el.dataset['id']);
          if (!it) return;
          // 就地更新選取狀態：只刷新銘牌與高亮，不走全域 update()（保留捲動位置）。
          store.selectedItem = toSelected(it);
          gridEl.querySelectorAll('[data-id].sel').forEach((s) => s.classList.remove('sel'));
          el.classList.add('sel');
          refreshPlaque();
        }),
      );
    };

    // 特殊分頁的子頁（section）切換：記住該分頁選的子頁，就地重繪網格。
    const wireSections = () => {
      gridEl?.querySelectorAll<HTMLElement>('[data-section]').forEach((el) =>
        el.addEventListener('click', () => {
          sectionState.set(store.activeTab, el.dataset['section']!);
          refreshGrid();
        }),
      );
    };

    const refreshGrid = () => {
      if (gridEl) gridEl.innerHTML = gridHTML();
      if (footerEl) footerEl.textContent = footerHTML();
      wireCells();
      wireSections();
    };

    const search = root.querySelector<HTMLInputElement>('#ov-search');
    if (search) {
      search.value = store.searchQuery;
      search.addEventListener('input', () => {
        store.searchQuery = search.value;
        refreshGrid();
      });
    }

    // 切頁籤就地更新（不走全域 update()，避免整個 app 重繪而重置 .content / .tab-rail 的捲動位置）。
    const tabEls = root.querySelectorAll<HTMLElement>('[data-tab]');
    tabEls.forEach((el) =>
      el.addEventListener('click', () => {
        const tab = Number(el.dataset['tab']);
        store.activeTab = tab;
        store.searchQuery = '';
        if (search) search.value = '';
        tabEls.forEach((t) => t.classList.toggle('active', Number(t.dataset['tab']) === tab));
        refreshGrid();
      }),
    );

    wireCells();
    wireSections();
    refreshPlaque();

    // 背景估價回來時，若更新的正是當前選中的傳奇物品，就地刷新銘牌的市場價。
    setPriceResolveHook((key) => {
      const sel = store.selectedItem;
      if (sel && key === keyOf(sel.name, sel.base)) refreshPlaque();
    });
  },
};
