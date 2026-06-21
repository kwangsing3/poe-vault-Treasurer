// 「物品過濾器」頁：規則清單 + 規則編輯器 + 匯出合法 .filter。
// 顯示層中文、產出層英文（見 ../filter.ts）。本頁先專注編輯/預覽/匯出，不含匯入 NeverSink。
import { update } from "../store";
import type { View } from "../router";
import {
  type FilterBlock,
  type Condition,
  type RGB,
  type Style,
  CONDITION_FIELDS,
  NUMERIC_OPS,
  STRING_OPS,
  RARITIES,
  ICON_COLORS,
  ICON_SHAPES,
  loadBlocks,
  saveBlocks,
  serialize,
  serializeFilter,
  parseFilter,
  emptyBlock,
  tokenizeValues,
} from "../filter";
import { esc } from "../html";
import baseZhRaw from "../base-zh.json";

// 英文 base/通貨 → 繁中（顯示層；由 scripts/build-base-zh.mjs 從 name-map 萃取）。
const baseZh = baseZhRaw as Record<string, string>;
// 反向：繁中 → 英文（由 baseZh 反轉）。供原始碼面板雙向切換基底語言時，把中文基底還原回英文內部值。
const baseEn: Record<string, string> = {};
for (const [en, zh] of Object.entries(baseZh)) if (!(zh in baseEn)) baseEn[zh] = en;

// 原始碼 / 匯出時，物品基底（BaseType）的顯示語言。預設英文（全平台相容）；中文台服亦接受。
// **只切換 BaseType**，Class / 動作 / 其他條件 / 註解一律原樣；內部規則永遠存英文。
const BASE_LANG_KEY = "poe-filter-base-lang";
let baseLang: "en" | "zh" = (() => {
  try {
    return localStorage.getItem(BASE_LANG_KEY) === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
})();

/** 翻譯單一 BaseType 條件值（含引號的多個 token）：逐 token 經 map 轉換、一律重新加引號。 */
function mapBaseTypeValue(value: string, map: Record<string, string>): string {
  const toks = tokenizeValues(value);
  if (!toks.length) return value;
  return toks.map((t) => `"${map[t] ?? t}"`).join(" ");
}

/** 回傳「BaseType 值經語言轉換」後的區塊副本（只動 BaseType 條件，其餘欄位共用參考）。 */
function blocksInBaseLang(blocks: FilterBlock[], map: Record<string, string>): FilterBlock[] {
  return blocks.map((b) =>
    b.conditions.some((c) => c.field === "BaseType")
      ? {
          ...b,
          conditions: b.conditions.map((c) =>
            c.field === "BaseType" ? { ...c, value: mapBaseTypeValue(c.value, map) } : c,
          ),
        }
      : b,
  );
}

// ── 模組狀態（跨重繪保留）──────────────────────────────────────────────────────
let BLOCKS: FilterBlock[] = [];
let PREAMBLE: string[] = []; // 匯入檔的檔頭註解（保留以無損輸出；僅當次 session）
let selectedId: string | null = null;
let loaded = false;
let importOpen = false; // 「讀取」面板是否展開
let importMsg = ""; // 上次解析結果摘要
let query = ""; // 搜尋字串
let expanded = new Set<string>(); // 已「展開」的樹節點 key；預設空＝全收合（解 739 條太長 + 懶渲染）
let contentRoot: HTMLElement | null = null;

/** 目前規則 → .filter 文字：匯入內容走無損 serializeFilter（不加產生器檔頭）；
 *  純手工規則才用 serialize()（含產生器檔頭）。以區塊是否帶匯入專屬欄位判定。 */
function serializeCurrent(): string {
  // 內部規則永遠存英文；輸出時若選中文，僅把 BaseType 轉成繁中（台服相容）。
  const blocks = baseLang === "zh" ? blocksInBaseLang(BLOCKS, baseZh) : BLOCKS;
  const imported =
    PREAMBLE.length > 0 ||
    BLOCKS.some(
      (b) =>
        b.comments?.length || b.headerComment || b.unknown?.length || b.cont,
    );
  return imported
    ? serializeFilter({ preamble: PREAMBLE, blocks })
    : serialize(blocks);
}

function ensureLoaded(): void {
  if (loaded) return;
  BLOCKS = loadBlocks();
  selectedId = BLOCKS[0]?.id ?? null;
  loaded = true;
}

function selected(): FilterBlock | undefined {
  return BLOCKS.find((b) => b.id === selectedId);
}

function persist(): void {
  saveBlocks(BLOCKS);
}

/** 局部重繪：重渲染本頁內容並重掛事件（用於結構性變更）。 */
function rerender(): void {
  if (!contentRoot) return;
  contentRoot.innerHTML = filter.render();
  filter.mount?.(contentRoot);
}

// ── 中文標籤對照（顯示層）─────────────────────────────────────────────────────
const FIELD_ZH: Record<string, string> = {
  Class: "類別",
  BaseType: "基底名",
  Rarity: "稀有度",
  ItemLevel: "物品等級",
  DropLevel: "掉落等級",
  AreaLevel: "區域等級",
  Quality: "品質",
  StackSize: "堆疊數",
  Sockets: "插槽",
  LinkedSockets: "連線數",
  MapTier: "地圖階級",
  GemLevel: "寶石等級",
  Corrupted: "已汙染",
  Identified: "已鑑定",
};
const RARITY_ZH: Record<string, string> = {
  Normal: "普通",
  Magic: "魔法",
  Rare: "稀有",
  Unique: "傳奇",
};

// 常見過濾器 Class → 繁中（顯示層；未列出者原樣顯示英文，不影響產出）。
const CLASS_ZH: Record<string, string> = {
  Currency: "通貨",
  "Divination Card": "命運卡",
  "Stackable Currency": "可堆疊通貨",
  Maps: "地圖",
  "Map Fragments": "地圖碎片",
  "Misc Map Items": "雜項地圖物品",
  Jewels: "珠寶",
  "Abyss Jewel": "深淵珠寶",
  "Cluster Jewel": "星團珠寶",
  "Body Armours": "胸甲",
  Boots: "鞋子",
  Gloves: "手套",
  Helmets: "頭盔",
  Shields: "盾",
  Rings: "戒指",
  Amulets: "護身符",
  Belts: "腰帶",
  Quivers: "箭袋",
  Bows: "弓",
  Wands: "法杖",
  Daggers: "匕首",
  "Rune Daggers": "符文匕首",
  Claws: "爪",
  "One Hand Swords": "單手劍",
  "Two Hand Swords": "雙手劍",
  "Thrusting One Hand Swords": "細劍",
  "One Hand Axes": "單手斧",
  "Two Hand Axes": "雙手斧",
  "One Hand Maces": "單手錘",
  "Two Hand Maces": "雙手錘",
  Sceptres: "權杖",
  Staves: "長杖",
  Warstaves: "戰杖",
  "Fishing Rods": "釣竿",
  "Life Flasks": "生命藥劑",
  "Mana Flasks": "魔力藥劑",
  "Hybrid Flasks": "複合藥劑",
  "Utility Flasks": "功能藥劑",
  "Active Skill Gems": "主動技能寶石",
  "Support Skill Gems": "輔助技能寶石",
  "Skill Gems": "技能寶石",
  Gems: "寶石",
  "Heist Gear": "劫盜裝備",
  "Heist Tools": "劫盜工具",
  "Heist Cloaks": "劫盜披風",
  "Heist Brooches": "劫盜胸針",
  Contract: "契約",
  Blueprint: "藍圖",
  Trinkets: "飾物",
  Pieces: "碎片",
};

/** 數個名稱 → 「前 3 個、…等 N 項」。 */
function joinFew(names: string[]): string {
  if (names.length <= 3) return names.join("、");
  return `${names.slice(0, 3).join("、")} …等 ${names.length} 項`;
}

/** 由條件推一個友善的中文提示（無 base/class 可顯示時用）。 */
function condHint(b: FilterBlock): string {
  const find = (f: string) => b.conditions.find((c) => c.field === f);
  const lk = find("LinkedSockets");
  if (lk?.value) return `${lk.value} 連線`;
  const sk = find("Sockets");
  if (sk?.value) return `插槽 ${sk.value}`;
  const mt = find("MapTier");
  if (mt?.value)
    return `地圖階級 ${mt.op} ${mt.value}`.replace(/\s+/g, " ").trim();
  const ss = find("StackSize");
  if (ss?.value) return `堆疊 ${ss.op} ${ss.value}`.replace(/\s+/g, " ").trim();
  const rr = find("Rarity");
  if (rr?.value)
    return `稀有度 ${rr.op} ${RARITY_ZH[rr.value] ?? rr.value}`
      .replace(/\s+/g, " ")
      .trim();
  const il = find("ItemLevel");
  if (il?.value)
    return `物品等級 ${il.op} ${il.value}`.replace(/\s+/g, " ").trim();
  return "";
}

/** 卡片友善標題：優先中文 base type，其次類別，再次條件提示，最後規則名。 */
function cardTitle(b: FilterBlock): string {
  const bt = b.conditions.find((c) => c.field === "BaseType");
  if (bt?.value) {
    const zh = tokenizeValues(bt.value).map((n) => baseZh[n] ?? n);
    if (zh.length) return joinFew(zh);
  }
  const cls = b.conditions.find((c) => c.field === "Class");
  if (cls?.value) {
    const zh = tokenizeValues(cls.value).map((n) => CLASS_ZH[n] ?? n);
    if (zh.length) return joinFew(zh);
  }
  return condHint(b) || b.name || "規則";
}

// ── 顏色工具 ──────────────────────────────────────────────────────────────────
function rgbToHex(c: RGB): string {
  // 只取 RGB 三色（color input 不吃 alpha）；匯入的第四個 alpha 由序列化層保留。
  return (
    "#" +
    c
      .slice(0, 3)
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
      .join("")
  );
}
function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** 規則預覽標籤的 inline style（依樣式即時呈現遊戲內外觀）。 */
function previewStyle(s: Style): string {
  const text = s.textColor ? rgbToHex(s.textColor) : "#cfc9bd";
  const border = s.borderColor ? rgbToHex(s.borderColor) : "transparent";
  const bg = s.bgColor ? rgbToHex(s.bgColor) : "rgba(15,15,15,0.85)";
  const fs = s.fontSize ?? 32;
  const px = Math.round(11 + (fs - 18) * 0.45); // 18→11px, 45→23px
  return `color:${text};border:2px solid ${border};background:${bg};font-size:${px}px;`;
}

function condSummary(b: FilterBlock): string {
  const extra = b.unknown?.length
    ? `<span class="filt-adv">+${b.unknown.length} 進階</span>`
    : "";
  if (!b.conditions.length) return extra || "（無條件 · 匹配全部）";
  const parts = b.conditions.map((c) => {
    const f = FIELD_ZH[c.field] ?? c.field;
    // 值可能是多個（含引號）token，太長時截斷成「前 4 項 …等 N 項」。
    const toks = tokenizeValues(c.value);
    const v =
      toks.length > 4
        ? toks.slice(0, 4).join(" ") + ` …等 ${toks.length} 項`
        : (c.value || "").replace(/"/g, "");
    return `${f}${c.op ? " " + c.op : ""} ${v}`.trim();
  });
  let txt = parts.join(" · ");
  if (txt.length > 140) txt = txt.slice(0, 140) + "…";
  txt = esc(txt); // parts 含使用者輸入的條件值；extra 為本地產生的計數 HTML，不跳脫
  return extra ? `${txt} · ${extra}` : txt;
}

// ── 分節分組 + 搜尋 ────────────────────────────────────────────────────────────
// NeverSink 標記（存在區塊 comments[] 裡）：`# [[NNNN]] 區段名`（雙括號）= 區段；
// `# [NNNN] 子段名`（單括號）= 子段。標記會延續到下一個同層標記前的所有區塊。
const SECTION_RE = /^#+\s*\[\[(\d+)\]\]\s*(.*)$/;
const SUBSECTION_RE = /^#+\s*\[(\d+)\]\s*(.*)$/; // 注意：雙括號不會命中（\[(\d+)\] 後接的是 [ 非數字）

interface TreeRule {
  b: FilterBlock;
  i: number; // BLOCKS 中的全域索引（供上移/下移/序號）
}
interface TreeSub {
  key: string;
  id: string;
  title: string;
  rules: TreeRule[];
}
interface TreeSec {
  key: string;
  id: string;
  title: string;
  loose: TreeRule[]; // 直屬區段、在任何子段之前的規則
  subs: TreeSub[];
}

/**
 * 把扁平 BLOCKS 走訪成 區段 ▸ 子段 ▸ 規則 的三層樹。
 * 規則：逐區塊掃 comments，雙括號→換區段（清子段）、單括號→換子段；無標記者沿用前一塊的歸屬。
 * 只在 id 改變時才開新節點，故檔頭那段 TOC（含整串標記、結尾為 body 區段標頭）只會落成正確的單一區段。
 */
function buildTree(): TreeSec[] {
  const secs: TreeSec[] = [];
  let sec: TreeSec | null = null;
  let sub: TreeSub | null = null;
  let secId = "";
  let secTitle = "（未分節）";
  let subId = "";
  let subTitle = "";
  for (let i = 0; i < BLOCKS.length; i++) {
    const b = BLOCKS[i]!;
    for (const c of b.comments ?? []) {
      const t = c.trim();
      const ms = SECTION_RE.exec(t);
      if (ms) {
        secId = ms[1]!;
        secTitle = ms[2]!.trim() || ms[1]!;
        subId = "";
        subTitle = "";
        continue;
      }
      const mu = SUBSECTION_RE.exec(t);
      if (mu) {
        subId = mu[1]!;
        subTitle = mu[2]!.trim() || mu[1]!;
      }
    }
    if (!sec || sec.id !== secId) {
      sec = { key: `sec${secs.length}`, id: secId, title: secTitle, loose: [], subs: [] };
      secs.push(sec);
      sub = null;
    }
    if (subId === "") {
      sub = null;
    } else if (!sub || sub.id !== subId) {
      sub = { key: `${sec.key}_sub${sec.subs.length}`, id: subId, title: subTitle, rules: [] };
      sec.subs.push(sub);
    }
    if (sub) sub.rules.push({ b, i });
    else sec.loose.push({ b, i });
  }
  return secs;
}

/** 整棵樹是否「需要樹狀呈現」（否＝單一未分節、無子段 → 平鋪）。 */
function isTreeShaped(tree: TreeSec[]): boolean {
  return !(tree.length === 1 && tree[0]!.id === "" && tree[0]!.subs.length === 0);
}

/** 蒐集所有節點 key（區段 + 子段），供「全展開」。 */
function allNodeKeys(tree: TreeSec[]): string[] {
  const keys: string[] = [];
  for (const s of tree) {
    keys.push(s.key);
    for (const su of s.subs) keys.push(su.key);
  }
  return keys;
}

/** 展開「含指定區塊」的區段（與子段），確保該規則在樹中可見（新增/選取後用）。 */
function revealBlock(id: string | null): void {
  if (!id) return;
  for (const s of buildTree()) {
    if (s.loose.some((r) => r.b.id === id)) {
      expanded.add(s.key);
      return;
    }
    for (const su of s.subs)
      if (su.rules.some((r) => r.b.id === id)) {
        expanded.add(s.key);
        expanded.add(su.key);
        return;
      }
  }
}

/** 搜尋比對：名稱 / 標頭註解 / 動作 / 條件欄位+值 / 進階行。 */
function matchBlock(b: FilterBlock, q: string): boolean {
  if (!q) return true;
  const hay = [
    b.name,
    b.headerComment ?? "",
    b.action,
    cardTitle(b),
    ...b.conditions.map((c) => `${c.field} ${c.value}`),
    ...(b.unknown ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

const EMPTY_LIST = '<div class="filt-empty">查無符合的規則。</div>';

/** 樹節點標頭（區段/子段共用），sub 走較淺樣式 + 縮排。 */
function nodeHeader(key: string, id: string, title: string, cnt: string, open: boolean, sub: boolean): string {
  const cls = sub ? "filt-sec-hd filt-sub-hd" : "filt-sec-hd";
  const indent = sub ? ' style="margin-left:14px;"' : "";
  const idTag = id ? `<span class="filt-sec-id">${esc(id)}</span>` : "";
  return `
    <div class="${cls} ${open ? "open" : ""}" data-node="${key}"${indent}>
      <span class="filt-sec-arrow">${open ? "▾" : "▸"}</span>
      ${idTag}<span class="filt-sec-name">${esc(title)}</span>
      <span class="filt-sec-cnt">${cnt}</span>
    </div>`;
}

/** 規則清單 HTML：區段 ▸ 子段 ▸ 規則 三層折疊樹（預設全收合、只渲染展開節點）。
 *  單一未分節且無子段時平鋪。搜尋時自動展開命中節點。 */
function listHtml(): string {
  const tree = buildTree();
  const q = query.trim().toLowerCase();

  // 手工小檔：單一未分節、無子段 → 平鋪（無樹狀外殼）。
  if (!isTreeShaped(tree)) {
    const items = q ? tree[0]!.loose.filter((r) => matchBlock(r.b, q)) : tree[0]!.loose;
    return items.length ? items.map((r) => blockCard(r.b, r.i, 0)).join("") : EMPTY_LIST;
  }

  const searching = q !== "";
  const out: string[] = [];
  for (const sec of tree) {
    const looseM = searching ? sec.loose.filter((r) => matchBlock(r.b, q)) : sec.loose;
    const subsM = sec.subs.map((su) => ({
      su,
      rules: searching ? su.rules.filter((r) => matchBlock(r.b, q)) : su.rules,
    }));
    const matchCount = looseM.length + subsM.reduce((s, x) => s + x.rules.length, 0);
    const total = sec.loose.length + sec.subs.reduce((s, su) => s + su.rules.length, 0);
    if (searching && matchCount === 0) continue;

    const open = searching || expanded.has(sec.key);
    const cnt = searching && matchCount !== total ? `${matchCount}/${total}` : `${total}`;
    out.push(nodeHeader(sec.key, sec.id, sec.title, cnt, open, false));
    if (!open) continue;

    for (const r of looseM) out.push(blockCard(r.b, r.i, 14));
    for (const { su, rules } of subsM) {
      if (searching && rules.length === 0) continue;
      const subOpen = searching || expanded.has(su.key);
      const scnt = searching && rules.length !== su.rules.length ? `${rules.length}/${su.rules.length}` : `${su.rules.length}`;
      out.push(nodeHeader(su.key, su.id, su.title, scnt, subOpen, true));
      if (!subOpen) continue;
      for (const r of rules) out.push(blockCard(r.b, r.i, 28));
    }
  }
  return out.length ? out.join("") : EMPTY_LIST;
}

// ── 讀取（匯入）面板 ──────────────────────────────────────────────────────────
function importPanel(): string {
  return `
    <div class="filt-import">
      <div class="filt-import-row">
        <button class="btn" id="imp-file">開啟 .filter 檔…</button>
        <span class="filt-hint">或將內容貼到下方後解析</span>
      </div>
      <textarea class="filt-import-ta" id="imp-text" spellcheck="false" placeholder="把現有 .filter 內容貼到這裡（支援 NeverSink 等大型檔）…"></textarea>
      <div class="filt-import-row">
        <label class="filt-chk"><input type="checkbox" id="imp-merge" /> 附加到現有規則（預設：取代）</label>
        <span class="filt-grow"></span>
        <button class="btn" id="imp-cancel">取消</button>
        <button class="btn btn-dark" id="imp-parse">解析並載入</button>
      </div>
      ${importMsg ? `<div class="filt-import-msg">${esc(importMsg)}</div>` : ""}
    </div>`;
}

// ── 規則清單卡片 ──────────────────────────────────────────────────────────────
function blockCard(b: FilterBlock, i: number, indent = 0): string {
  const sel = b.id === selectedId ? "on" : "";
  const off = b.enabled ? "" : "off";
  const actCls = b.action === "Show" ? "show" : "hide";
  const actZh =
    b.action === "Show" ? "顯示" : b.action === "Hide" ? "隱藏" : "精簡";
  const title = esc(cardTitle(b));
  const ind = indent ? ` style="margin-left:${indent}px;"` : "";
  return `
    <div class="filt-card ${sel} ${off}" data-pick="${b.id}"${ind}>
      <div class="filt-card-top">
        <span class="filt-badge ${actCls}">${actZh}</span>
        <span class="filt-card-name">${title}</span>
        <span class="filt-card-ord">${i + 1}</span>
      </div>
      <div class="filt-prev" data-prev="${b.id}" style="${previewStyle(b.style)}">${title}</div>
      <div class="filt-card-sum">${condSummary(b)}</div>
      <div class="filt-card-acts">
        <button class="filt-mini" data-act="up" data-id="${b.id}" title="上移">▲</button>
        <button class="filt-mini" data-act="down" data-id="${b.id}" title="下移">▼</button>
        <button class="filt-mini" data-act="toggle" data-id="${b.id}" title="啟用/停用">${b.enabled ? "◉" : "○"}</button>
        <button class="filt-mini danger" data-act="del" data-id="${b.id}" title="刪除">✕</button>
      </div>
    </div>`;
}

// ── 編輯器：條件 ──────────────────────────────────────────────────────────────
function condRow(c: Condition, idx: number): string {
  const fieldDef = CONDITION_FIELDS.find((f) => f.key === c.field);
  const ops = fieldDef?.numeric ? NUMERIC_OPS : STRING_OPS;
  const fieldOpts = CONDITION_FIELDS.map(
    (f) =>
      `<option value="${f.key}" ${f.key === c.field ? "selected" : ""}>${FIELD_ZH[f.key] ?? f.key}</option>`,
  ).join("");
  const opOpts = ops
    .map(
      (o) =>
        `<option value="${o}" ${o === c.op ? "selected" : ""}>${o || "包含"}</option>`,
    )
    .join("");
  // Rarity 用下拉，其餘用文字
  let valInput: string;
  if (c.field === "Rarity") {
    valInput = `<select class="filt-in" data-cond="val" data-idx="${idx}">${RARITIES.map(
      (r) =>
        `<option value="${r}" ${r === c.value ? "selected" : ""}>${RARITY_ZH[r]}</option>`,
    ).join("")}</select>`;
  } else {
    valInput = `<input class="filt-in" data-cond="val" data-idx="${idx}" value="${esc(c.value)}" placeholder="值（字串請加引號）" />`;
  }
  return `
    <div class="filt-cond">
      <select class="filt-in" data-cond="field" data-idx="${idx}">${fieldOpts}</select>
      <select class="filt-in narrow" data-cond="op" data-idx="${idx}">${opOpts}</select>
      ${valInput}
      <button class="filt-mini danger" data-cond="del" data-idx="${idx}" title="移除條件">✕</button>
    </div>`;
}

// ── 編輯器：樣式列（顏色） ─────────────────────────────────────────────────────
function colorRow(
  label: string,
  key: "textColor" | "borderColor" | "bgColor",
  s: Style,
): string {
  const v = s[key];
  const on = v !== undefined;
  return `
    <div class="filt-style-row">
      <label class="filt-chk"><input type="checkbox" data-style-on="${key}" ${on ? "checked" : ""}/> ${label}</label>
      <input type="color" class="filt-color" data-style-color="${key}" value="${rgbToHex(v ?? [200, 200, 200])}" ${on ? "" : "disabled"} />
    </div>`;
}

function editor(b: FilterBlock): string {
  const s = b.style;
  const icon = s.minimapIcon;
  const beam = s.beam;
  const snd = s.alertSound;
  const iconColorOpts = ICON_COLORS.map(
    (c) =>
      `<option value="${c}" ${icon?.color === c ? "selected" : ""}>${c}</option>`,
  ).join("");
  const iconShapeOpts = ICON_SHAPES.map(
    (c) =>
      `<option value="${c}" ${icon?.shape === c ? "selected" : ""}>${c}</option>`,
  ).join("");
  const beamColorOpts = ICON_COLORS.map(
    (c) =>
      `<option value="${c}" ${beam?.color === c ? "selected" : ""}>${c}</option>`,
  ).join("");
  return `
    <div class="filt-ed">
      <div class="filt-ed-head">
        <input class="filt-in grow" id="ed-name" value="${esc(b.name)}" placeholder="規則名稱" />
        <div class="filt-seg">
          <div class="opt ${b.action === "Show" ? "on" : ""}" data-action="Show">顯示</div>
          <div class="opt ${b.action === "Hide" ? "on" : ""}" data-action="Hide">隱藏</div>
        </div>
      </div>

      <div class="filt-sec-ttl">條件<button class="filt-add" id="add-cond">＋ 條件</button></div>
      <div class="filt-conds">${b.conditions.map(condRow).join("") || '<div class="filt-empty">尚無條件（匹配全部物品）</div>'}</div>
      ${
        b.unknown?.length
          ? `
      <div class="filt-sec-ttl">進階（保留原樣 · 唯讀）</div>
      <pre class="filt-passthrough">${b.unknown.map((u) => esc(u)).join("\n")}</pre>`
          : ""
      }

      <div class="filt-sec-ttl">外觀</div>
      ${colorRow("文字顏色", "textColor", s)}
      ${colorRow("邊框顏色", "borderColor", s)}
      ${colorRow("背景顏色", "bgColor", s)}

      <div class="filt-style-row">
        <label class="filt-chk"><input type="checkbox" data-style-on="fontSize" ${s.fontSize !== undefined ? "checked" : ""}/> 字體大小</label>
        <input type="range" min="18" max="45" value="${s.fontSize ?? 32}" data-style="fontSize" ${s.fontSize !== undefined ? "" : "disabled"} />
        <span class="filt-val" id="fs-val">${s.fontSize ?? 32}</span>
      </div>

      <div class="filt-style-row">
        <label class="filt-chk"><input type="checkbox" data-style-on="minimapIcon" ${icon ? "checked" : ""}/> 小地圖圖示</label>
        <select class="filt-in narrow" data-icon="size" ${icon ? "" : "disabled"}>
          ${[0, 1, 2].map((z) => `<option value="${z}" ${icon?.size === z ? "selected" : ""}>${["大", "中", "小"][z]}</option>`).join("")}
        </select>
        <select class="filt-in" data-icon="color" ${icon ? "" : "disabled"}>${iconColorOpts}</select>
        <select class="filt-in" data-icon="shape" ${icon ? "" : "disabled"}>${iconShapeOpts}</select>
      </div>

      <div class="filt-style-row">
        <label class="filt-chk"><input type="checkbox" data-style-on="beam" ${beam ? "checked" : ""}/> 光束</label>
        <select class="filt-in" data-beam="color" ${beam ? "" : "disabled"}>${beamColorOpts}</select>
        <label class="filt-chk small"><input type="checkbox" data-beam="temp" ${beam?.temp ? "checked" : ""} ${beam ? "" : "disabled"}/> 短暫</label>
      </div>

      <div class="filt-style-row">
        <label class="filt-chk"><input type="checkbox" data-style-on="alertSound" ${snd ? "checked" : ""}/> 警示音效</label>
        <span class="filt-val">ID</span>
        <input type="number" min="1" max="16" class="filt-in narrow" data-snd="id" value="${snd?.id ?? 1}" ${snd ? "" : "disabled"} />
        <span class="filt-val">音量</span>
        <input type="number" min="0" max="300" class="filt-in narrow" data-snd="volume" value="${snd?.volume ?? 100}" ${snd ? "" : "disabled"} />
      </div>
    </div>`;
}

// ── 主畫面 ────────────────────────────────────────────────────────────────────
export const filter: View = {
  render() {
    ensureLoaded();
    const b = selected();
    const list = BLOCKS.length
      ? listHtml()
      : '<div class="filt-empty">尚無規則，按上方新增或讀取。</div>';
    const showTree = isTreeShaped(buildTree());
    return `
      <div class="page-head">
        <span class="ttl">物品過濾器 · ITEM FILTER</span>
        <span class="sub">編輯規則 · 即時預覽 · 匯出 .filter</span>
      </div>
      <div class="filt-wrap">
        <div class="filt-main">
          <div class="filt-main-bar">
            <span class="filt-main-ttl">規 則（${BLOCKS.length}）</span>
            <div class="filt-toolbar">
              <button class="btn ${importOpen ? "btn-dark" : ""}" id="open-import">讀取</button>
              <button class="btn" id="add-show">＋ 顯示</button>
              <button class="btn" id="add-hide">＋ 隱藏</button>
            </div>
          </div>
          ${importOpen ? importPanel() : ""}
          ${importMsg && !importOpen ? `<div class="filt-import-msg banner">${esc(importMsg)}</div>` : ""}
          ${
            BLOCKS.length
              ? `
          <div class="filt-search-row">
            <input class="filt-search" id="filt-search" type="search" placeholder="搜尋規則 / 基底 / 類別…" value="${esc(query)}" />
            ${showTree ? `<button class="filt-add" id="sec-toggle-all" title="全部展開 / 收合">${expanded.size ? "全收合" : "全展開"}</button>` : ""}
          </div>`
              : ""
          }
          <div class="filt-list">${list}</div>
        </div>

        <div class="filt-rail">
          <div class="panel filt-ed-panel">
            <div class="panel-bar"><span class="name">編 輯</span></div>
            ${b ? editor(b) : '<div class="filt-empty pad">選擇右側規則以編輯，或新增一條。</div>'}
          </div>

          <div class="panel filt-out-panel">
            <div class="panel-bar">
              <span class="name" title="可直接編輯，離開欄位即反解析回規則">原始碼 · .filter</span>
              <div class="filt-toolbar">
                <button class="btn" id="base-lang" title="切換產出 .filter 的物品基底語言（英文 / 中文；只影響 BaseType）">基底：${baseLang === "zh" ? "中文" : "EN"}</button>
                <button class="btn" id="copy-out">複製</button>
                <button class="btn btn-dark" id="dl-out">下載</button>
              </div>
            </div>
            <textarea class="filt-out" id="filt-out" spellcheck="false" placeholder="在此貼上或編輯 .filter 原始碼…">${esc(serializeCurrent())}</textarea>
          </div>
        </div>
      </div>`;
  },

  mount(root) {
    contentRoot = root;
    const b = selected();

    // 新增規則
    const addBlock = (action: "Show" | "Hide") => {
      const nb = emptyBlock(action);
      BLOCKS.push(nb);
      selectedId = nb.id;
      revealBlock(nb.id); // 展開其所屬區段，確保新規則在樹中可見
      persist();
      rerender();
    };
    root.querySelector("#add-show")?.addEventListener("click", () => addBlock("Show"));
    root.querySelector("#add-hide")?.addEventListener("click", () => addBlock("Hide"));

    // 規則清單事件（選取 / 卡片操作 / 區段折疊）
    bindListEvents(root);

    // 搜尋：只局部刷新清單，保留輸入焦點。
    root
      .querySelector<HTMLInputElement>("#filt-search")
      ?.addEventListener("input", (e) => {
        query = (e.target as HTMLInputElement).value;
        refreshList(root);
      });
    // 全展開 / 全收合
    root.querySelector("#sec-toggle-all")?.addEventListener("click", () => {
      if (expanded.size) expanded = new Set();
      else expanded = new Set(allNodeKeys(buildTree()));
      rerender(); // 重繪以更新按鈕文字
    });

    // 讀取（匯入）
    mountImport(root);

    // 切換 .filter 物品基底語言（英文 ⇄ 中文；只影響 BaseType）。
    root.querySelector("#base-lang")?.addEventListener("click", () => {
      baseLang = baseLang === "zh" ? "en" : "zh";
      try {
        localStorage.setItem(BASE_LANG_KEY, baseLang);
      } catch {
        /* 隱私模式忽略 */
      }
      rerender();
    });

    // 匯出：複製 / 下載
    root.querySelector("#copy-out")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(serializeCurrent());
      } catch {
        /* ignore */
      }
    });
    root.querySelector("#dl-out")?.addEventListener("click", () => {
      const blob = new Blob([serializeCurrent()], {
        type: "text/plain;charset=utf-8",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "custom.filter";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // 原始碼編輯：離開欄位（change/blur）時把文字反解析回規則並重繪。
    root
      .querySelector<HTMLTextAreaElement>("#filt-out")
      ?.addEventListener("change", (e) => {
        const text = (e.target as HTMLTextAreaElement).value;
        let pf: ReturnType<typeof parseFilter>;
        try {
          pf = parseFilter(text);
        } catch {
          return;
        } // 解析失敗：保留原規則
        // 若目前以中文檢視，把使用者輸入的中文基底還原回英文（內部一律存英文）。
        BLOCKS = baseLang === "zh" ? blocksInBaseLang(pf.blocks, baseEn) : pf.blocks;
        PREAMBLE = pf.preamble;
        selectedId = BLOCKS[0]?.id ?? null;
        query = "";
        expanded = new Set();
        persist();
        rerender();
      });

    if (!b) return;

    // 規則名稱
    root
      .querySelector<HTMLInputElement>("#ed-name")
      ?.addEventListener("change", (e) => {
        b.name = (e.target as HTMLInputElement).value;
        persist();
        rerender();
      });
    // Show/Hide
    root.querySelectorAll<HTMLElement>("[data-action]").forEach((el) =>
      el.addEventListener("click", () => {
        b.action = el.dataset["action"] as "Show" | "Hide";
        persist();
        rerender();
      }),
    );

    // 條件：新增
    root.querySelector("#add-cond")?.addEventListener("click", () => {
      b.conditions.push({ field: "BaseType", op: "", value: "" });
      persist();
      rerender();
    });
    // 條件：欄位/運算子/值/刪除
    root.querySelectorAll<HTMLElement>("[data-cond]").forEach((el) => {
      const idx = Number(el.dataset["idx"]);
      const kind = el.dataset["cond"];
      if (kind === "del") {
        el.addEventListener("click", () => {
          b.conditions.splice(idx, 1);
          persist();
          rerender();
        });
      } else if (kind === "field") {
        el.addEventListener("change", (e) => {
          const c = b.conditions[idx]!;
          c.field = (e.target as HTMLSelectElement).value;
          const def = CONDITION_FIELDS.find((f) => f.key === c.field);
          // 切換數值/字串時，運算子與值重設為合理預設
          if (def?.numeric) {
            if (!NUMERIC_OPS.includes(c.op)) c.op = ">=";
          } else {
            c.op = "";
          }
          if (c.field === "Rarity" && !RARITIES.includes(c.value))
            c.value = "Rare";
          persist();
          rerender();
        });
      } else if (kind === "op") {
        el.addEventListener("change", (e) => {
          b.conditions[idx]!.op = (e.target as HTMLSelectElement).value;
          persist();
          rerender();
        });
      } else if (kind === "val") {
        el.addEventListener("change", (e) => {
          b.conditions[idx]!.value = (
            e.target as HTMLInputElement | HTMLSelectElement
          ).value;
          persist();
          refreshOut(root);
        });
      }
    });

    // 樣式：啟用/停用開關
    root.querySelectorAll<HTMLInputElement>("[data-style-on]").forEach((el) =>
      el.addEventListener("change", () => {
        const key = el.dataset["styleOn"] as keyof Style;
        if (el.checked) {
          if (key === "textColor") b.style.textColor = [200, 200, 200];
          else if (key === "borderColor") b.style.borderColor = [200, 0, 0];
          else if (key === "bgColor") b.style.bgColor = [20, 20, 20];
          else if (key === "fontSize") b.style.fontSize = 32;
          else if (key === "minimapIcon")
            b.style.minimapIcon = { size: 0, color: "White", shape: "Circle" };
          else if (key === "beam")
            b.style.beam = { color: "White", temp: false };
          else if (key === "alertSound")
            b.style.alertSound = { id: 1, volume: 100 };
        } else {
          delete b.style[key];
        }
        persist();
        rerender();
      }),
    );

    // 樣式：顏色（即時預覽，不整頁重繪以保留操作）
    root
      .querySelectorAll<HTMLInputElement>("[data-style-color]")
      .forEach((el) =>
        el.addEventListener("input", () => {
          const key = el.dataset["styleColor"] as
            | "textColor"
            | "borderColor"
            | "bgColor";
          b.style[key] = hexToRgb(el.value);
          persist();
          livePreview(root, b);
          refreshOut(root);
        }),
      );

    // 樣式：字體大小
    const fs = root.querySelector<HTMLInputElement>('[data-style="fontSize"]');
    fs?.addEventListener("input", () => {
      b.style.fontSize = Number(fs.value);
      const lbl = root.querySelector("#fs-val");
      if (lbl) lbl.textContent = fs.value;
      persist();
      livePreview(root, b);
      refreshOut(root);
    });

    // 樣式：小地圖圖示
    root.querySelectorAll<HTMLSelectElement>("[data-icon]").forEach((el) =>
      el.addEventListener("change", () => {
        if (!b.style.minimapIcon) return;
        const k = el.dataset["icon"] as "size" | "color" | "shape";
        if (k === "size") b.style.minimapIcon.size = Number(el.value);
        else b.style.minimapIcon[k] = el.value;
        persist();
        refreshOut(root);
      }),
    );
    // 樣式：光束
    root.querySelectorAll<HTMLElement>("[data-beam]").forEach((el) =>
      el.addEventListener("change", () => {
        if (!b.style.beam) return;
        const k = el.dataset["beam"];
        if (k === "color") b.style.beam.color = (el as HTMLSelectElement).value;
        else b.style.beam.temp = (el as HTMLInputElement).checked;
        persist();
        refreshOut(root);
      }),
    );
    // 樣式：音效
    root.querySelectorAll<HTMLInputElement>("[data-snd]").forEach((el) =>
      el.addEventListener("change", () => {
        if (!b.style.alertSound) return;
        const k = el.dataset["snd"] as "id" | "volume";
        b.style.alertSound[k] = Number(el.value);
        persist();
        refreshOut(root);
      }),
    );
  },
};

/** 只刷新預覽標籤（顏色/字級即時），避免整頁重繪導致輸入失焦。 */
function livePreview(root: HTMLElement, b: FilterBlock): void {
  const css = previewStyle(b.style);
  root
    .querySelectorAll<HTMLElement>(`.filt-prev.big, [data-prev="${b.id}"]`)
    .forEach((el) => el.setAttribute("style", css));
}
/** 只刷新輸出文字。 */
function refreshOut(root: HTMLElement): void {
  const out = root.querySelector<HTMLTextAreaElement>("#filt-out");
  if (out) out.value = serializeCurrent();
}

/** 只重繪規則清單並重掛清單事件（搜尋 / 區段折疊用，避免整頁重繪與失焦）。 */
function refreshList(root: HTMLElement): void {
  const listEl = root.querySelector(".filt-list");
  if (listEl) {
    listEl.innerHTML = BLOCKS.length
      ? listHtml()
      : '<div class="filt-empty">尚無規則，按上方新增或讀取。</div>';
  }
  bindListEvents(root);
}

/** 掛上清單區的事件：選取、卡片操作（上移/下移/啟停/刪除）、區段折疊。 */
function bindListEvents(root: HTMLElement): void {
  // 選取規則
  root.querySelectorAll<HTMLElement>("[data-pick]").forEach((el) =>
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-act]")) return; // 操作鈕不觸發選取
      selectedId = el.dataset["pick"]!;
      rerender();
    }),
  );
  // 卡片操作
  root.querySelectorAll<HTMLElement>("[data-act]").forEach((el) =>
    el.addEventListener("click", () => {
      const id = el.dataset["id"]!;
      const i = BLOCKS.findIndex((x) => x.id === id);
      if (i < 0) return;
      const act = el.dataset["act"];
      if (act === "up" && i > 0)
        [BLOCKS[i - 1], BLOCKS[i]] = [BLOCKS[i]!, BLOCKS[i - 1]!];
      else if (act === "down" && i < BLOCKS.length - 1)
        [BLOCKS[i + 1], BLOCKS[i]] = [BLOCKS[i]!, BLOCKS[i + 1]!];
      else if (act === "toggle") BLOCKS[i]!.enabled = !BLOCKS[i]!.enabled;
      else if (act === "del") {
        BLOCKS.splice(i, 1);
        if (selectedId === id) selectedId = BLOCKS[0]?.id ?? null;
      }
      persist();
      rerender();
    }),
  );
  // 節點展開 / 收合（區段 + 子段共用 data-node）
  root.querySelectorAll<HTMLElement>("[data-node]").forEach((el) =>
    el.addEventListener("click", () => {
      const key = el.dataset["node"]!;
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      refreshList(root);
    }),
  );
}

// ── 讀取（匯入）行為 ──────────────────────────────────────────────────────────
/** 解析文字並載入；merge=true 時附加到現有規則，否則取代。 */
function doImport(text: string, merge: boolean): void {
  let pf: ReturnType<typeof parseFilter>;
  try {
    pf = parseFilter(text);
  } catch (err) {
    importMsg = `⚠ 解析失敗：${err instanceof Error ? err.message : String(err)}`;
    importOpen = true; // 保持面板開啟讓使用者看到錯誤
    rerender();
    return;
  }
  if (!pf.blocks.length) {
    importMsg = `⚠ 沒有解析到任何規則（讀入 ${text.split(/\r?\n/).length} 行，但找不到 Show/Hide/Minimal 區塊；確認是合法 PoE1 .filter）。`;
    importOpen = true;
    rerender();
    return;
  }
  if (merge) {
    BLOCKS = BLOCKS.concat(pf.blocks);
    // 合併時把匯入檔頭併入現有 preamble（去重從略）
    if (pf.preamble.length) PREAMBLE = PREAMBLE.concat(pf.preamble);
  } else {
    BLOCKS = pf.blocks;
    PREAMBLE = pf.preamble;
  }
  selectedId = pf.blocks[0]!.id;
  query = "";
  expanded = new Set();
  const advanced = pf.blocks.filter((b) => b.unknown?.length).length;
  importMsg = `✓ 已載入 ${pf.blocks.length} 條規則${advanced ? `（${advanced} 條含進階條件，已保留原樣）` : ""}。`;
  importOpen = false;
  persist();
  rerender();
}

function mountImport(root: HTMLElement): void {
  root.querySelector("#open-import")?.addEventListener("click", () => {
    importOpen = !importOpen;
    importMsg = "";
    rerender();
  });
  root.querySelector("#imp-cancel")?.addEventListener("click", () => {
    importOpen = false;
    rerender();
  });
  root.querySelector("#imp-parse")?.addEventListener("click", () => {
    const ta = root.querySelector<HTMLTextAreaElement>("#imp-text");
    const merge =
      root.querySelector<HTMLInputElement>("#imp-merge")?.checked ?? false;
    const text = ta?.value ?? "";
    if (!text.trim()) {
      importMsg = "⚠ 請先貼上內容或開啟檔案。";
      rerender();
      return;
    }
    doImport(text, merge);
  });
  // 開啟本機 .filter：用隱藏的 file input + FileReader（renderer 直接讀，免 IPC）。
  root.querySelector("#imp-file")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".filter,text/plain";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const merge =
        root.querySelector<HTMLInputElement>("#imp-merge")?.checked ?? false;
      const reader = new FileReader();
      reader.onload = () => doImport(String(reader.result ?? ""), merge);
      reader.readAsText(file, "utf-8");
    });
    input.click();
  });
}
