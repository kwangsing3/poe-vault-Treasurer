// 物品過濾器：資料模型 + 序列化（產出合法 .filter）+ localStorage 持久化。
//
// 設計原則（見 FILTER-EDITOR-ANALYSIS.md / POE1-FILTER-RULES.md）：
// - 規則內部用「英文 DSL 關鍵字 + 英文值」儲存與輸出（台版亦相容、全平台通用）。
// - UI 顯示層用繁中（見 views/filter.ts 的中文標籤），與產出層分離。
// - 序列化目標：可直接在遊戲內載入的合法 PoE1 .filter。

export type BlockAction = 'Show' | 'Hide' | 'Minimal';
/** 顏色：R G B [A]，各 0–255。存成陣列以無損保留 alpha（NeverSink 大量使用）。 */
export type RGB = number[];

/** 一條條件：欄位 + 運算子 + 值（值為使用者輸入的原文，字串值請自行加引號）。 */
export interface Condition {
  field: string;
  op: string; // '' | '=' | '==' | '!' | '>' | '<' | '>=' | '<='
  value: string;
}

export interface MinimapIcon {
  size: number; // 0(大) 1(中) 2(小)
  color: string; // Red/Green/...
  shape: string; // Circle/Diamond/...
}

export interface Style {
  textColor?: RGB | undefined;
  borderColor?: RGB | undefined;
  bgColor?: RGB | undefined;
  fontSize?: number | undefined; // 18–45
  minimapIcon?: MinimapIcon | undefined;
  beam?: { color: string; temp: boolean } | undefined; // PlayEffect
  // PlayAlertSound 1–16 / 0–300；volume 省略時不輸出（保持與原檔一致）。
  alertSound?: { id: number; volume?: number | undefined } | undefined;
}

export interface FilterBlock {
  id: string;
  name: string; // 使用者可讀的規則名（僅 UI / 註解用）
  action: BlockAction;
  enabled: boolean; // 關閉時序列化為註解
  conditions: Condition[];
  style: Style;
  // ── 無損匯入用（手工新建的規則這些為 undefined）──────────────────────────
  comments?: string[] | undefined; // 區塊前的原始註解行（含 #=== 分節標記），原樣保留
  headerComment?: string | undefined; // 標頭行尾註解，如 `Show # %D8 $type->6l`（FilterBlade 標記），原樣保留
  unknown?: string[] | undefined; // 解析不認得的條件/動作行，原樣 passthrough（不丟失）
  cont?: boolean | undefined; // 是否帶 Continue 旗標
}

/** 一份解析後的 .filter：檔頭 preamble（區塊前的註解/空行）+ 區塊序列。 */
export interface ParsedFilter {
  preamble: string[];
  blocks: FilterBlock[];
}

// ── 可選欄位/列舉（供 UI 下拉；值一律英文，標籤中文在 view 層）。 ──────────────

/** 條件欄位目錄：key=DSL 關鍵字，numeric=是否數值（決定運算子集）。 */
export const CONDITION_FIELDS: { key: string; numeric: boolean }[] = [
  { key: 'Class', numeric: false },
  { key: 'BaseType', numeric: false },
  { key: 'Rarity', numeric: false },
  { key: 'ItemLevel', numeric: true },
  { key: 'DropLevel', numeric: true },
  { key: 'AreaLevel', numeric: true },
  { key: 'Quality', numeric: true },
  { key: 'StackSize', numeric: true },
  { key: 'Sockets', numeric: false },
  { key: 'LinkedSockets', numeric: true },
  { key: 'MapTier', numeric: true },
  { key: 'GemLevel', numeric: true },
  { key: 'Corrupted', numeric: false },
  { key: 'Identified', numeric: false },
];

export const NUMERIC_OPS = ['=', '==', '>', '>=', '<', '<='];
export const STRING_OPS = ['', '==', '!']; // '' = 包含；== 精確；! 不含
export const RARITIES = ['Normal', 'Magic', 'Rare', 'Unique'];
export const ICON_COLORS = ['Red', 'Green', 'Blue', 'Brown', 'White', 'Yellow', 'Cyan', 'Grey', 'Orange', 'Pink', 'Purple'];
export const ICON_SHAPES = ['Circle', 'Diamond', 'Hexagon', 'Square', 'Star', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'];

// ── 序列化（FilterBlock[] → .filter 文字）──────────────────────────────────────

function styleLines(s: Style): string[] {
  const out: string[] = [];
  if (s.textColor) out.push(`    SetTextColor ${s.textColor.join(' ')}`);
  if (s.borderColor) out.push(`    SetBorderColor ${s.borderColor.join(' ')}`);
  if (s.bgColor) out.push(`    SetBackgroundColor ${s.bgColor.join(' ')}`);
  if (s.fontSize !== undefined) out.push(`    SetFontSize ${s.fontSize}`);
  if (s.alertSound) {
    const vol = s.alertSound.volume !== undefined ? ` ${s.alertSound.volume}` : '';
    out.push(`    PlayAlertSound ${s.alertSound.id}${vol}`);
  }
  if (s.minimapIcon) out.push(`    MinimapIcon ${s.minimapIcon.size} ${s.minimapIcon.color} ${s.minimapIcon.shape}`);
  if (s.beam) out.push(`    PlayEffect ${s.beam.color}${s.beam.temp ? ' Temp' : ''}`);
  return out;
}

/** 單一區塊 → .filter 文字（停用時整塊以 # 註解）。 */
export function serializeBlock(b: FilterBlock): string {
  const lines: string[] = [];
  // 匯入的原始註解（含分節標記）優先；否則用手工規則名當註解。
  if (b.comments?.length) lines.push(...b.comments);
  else if (b.name) lines.push(`# ${b.name}`);
  lines.push(b.headerComment ? `${b.action} ${b.headerComment}` : b.action);
  for (const c of b.conditions) {
    if (!c.field) continue;
    const op = c.op ? ` ${c.op}` : '';
    const val = c.value ? ` ${c.value}` : '';
    lines.push(`    ${c.field}${op}${val}`);
  }
  lines.push(...styleLines(b.style));
  if (b.unknown?.length) for (const u of b.unknown) lines.push(`    ${u}`); // 原樣 passthrough
  if (b.cont) lines.push('    Continue');
  const text = lines.join('\n');
  // 停用：逐行以 # 註解（已是註解的行不重複加）。
  if (!b.enabled) return text.split('\n').map((l) => (l.trimStart().startsWith('#') ? l : `# ${l}`)).join('\n');
  return text;
}

/** 完整 .filter（含檔頭註解）。 */
export function serialize(blocks: FilterBlock[]): string {
  const header = [
    '#===============================================================',
    '# 由「物品過濾器」產生 · poe-coco-Treasurer',
    '# PoE1 · 英文 BaseType/Class（台版與國際版皆相容）',
    '#===============================================================',
  ].join('\n');
  return `${header}\n\n${blocks.map(serializeBlock).join('\n\n')}\n`;
}

/** 完整 .filter（保留匯入時的檔頭 preamble，不另加產生器檔頭）。 */
export function serializeFilter(pf: ParsedFilter): string {
  const parts: string[] = [];
  if (pf.preamble.length) parts.push(pf.preamble.join('\n').trimEnd());
  if (pf.blocks.length) parts.push(pf.blocks.map(serializeBlock).join('\n\n'));
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ── 解析（.filter 文字 → ParsedFilter）────────────────────────────────────────
//
// 無損原則：認得的條件/動作 → 結構化欄位（可編輯/可預覽）；不認得的整行原樣存進
// unknown[]，區塊前的註解存 comments[]。序列化時原樣吐回 → 即使模型只認得部分 DSL，
// 讀一份完整 NeverSink 也不會破壞它（見 FILTER-EDITOR-ANALYSIS.md §6）。

const BLOCK_HEADERS = new Set<string>(['Show', 'Hide', 'Minimal']);
const STYLE_KEYWORDS = new Set<string>([
  'SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'SetFontSize', 'PlayAlertSound', 'MinimapIcon', 'PlayEffect',
]);
const CONDITION_KEYWORDS = new Set<string>(CONDITION_FIELDS.map((f) => f.key));

/** 解析一行動作到 style；無法解析回 false（交由呼叫端進 unknown）。 */
function applyStyleLine(style: Style, key: string, rest: string): boolean {
  const t = rest.split(/\s+/).filter(Boolean);
  if (key === 'SetTextColor' || key === 'SetBorderColor' || key === 'SetBackgroundColor') {
    const nums = t.map(Number);
    if (!nums.length || nums.some((n) => Number.isNaN(n))) return false;
    if (key === 'SetTextColor') style.textColor = nums;
    else if (key === 'SetBorderColor') style.borderColor = nums;
    else style.bgColor = nums;
    return true;
  }
  if (key === 'SetFontSize') {
    const n = Number(t[0]);
    if (Number.isNaN(n)) return false;
    style.fontSize = n;
    return true;
  }
  if (key === 'PlayAlertSound') {
    const id = Number(t[0]);
    if (Number.isNaN(id)) return false;
    const vol = t[1] !== undefined ? Number(t[1]) : undefined;
    style.alertSound = vol !== undefined && !Number.isNaN(vol) ? { id, volume: vol } : { id };
    return true;
  }
  if (key === 'MinimapIcon') {
    if (t.length < 3) return false;
    style.minimapIcon = { size: Number(t[0]), color: t[1]!, shape: t[2]! };
    return true;
  }
  if (key === 'PlayEffect') {
    if (!t.length) return false;
    style.beam = { color: t[0]!, temp: t.includes('Temp') };
    return true;
  }
  return false;
}

const CONDITION_RE = /^(\S+)\s*(==|!=|>=|<=|=|!|<|>)?\s*(.*)$/;

/** 由 comments 取一個適合當卡片標題的名字（最後一行有意義的註解，去掉前綴 #）。 */
function nameFromComments(comments: string[]): string {
  for (let i = comments.length - 1; i >= 0; i--) {
    const s = comments[i]!.replace(/^#+/, '').trim();
    if (s) return s;
  }
  return '';
}

export function parseFilter(text: string): ParsedFilter {
  const lines = text.split(/\r?\n/);
  const preamble: string[] = [];
  const blocks: FilterBlock[] = [];
  let cur: FilterBlock | null = null;
  let pending: string[] = []; // 累積的註解/空行，歸給下一個區塊（或檔頭）

  const flushPendingComments = (): void => {
    // 區塊內遇到內容行時，pending 裡的註解屬於此區塊內部 → 進 unknown（空行丟棄）。
    if (!cur) return;
    const cmts = pending.filter((l) => l.trim().startsWith('#'));
    if (cmts.length) (cur.unknown ??= []).push(...cmts.map((l) => l.trim()));
    pending = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    const first = trimmed.split(/\s+/)[0] ?? '';

    // 標頭：首 token 為 Show/Hide/Minimal，其後須為空或註解（NeverSink 常帶 `# %D8 $type->…` 尾註解）。
    const headerRest = BLOCK_HEADERS.has(first) ? trimmed.slice(first.length).trim() : null;
    if (headerRest !== null && (headerRest === '' || headerRest.startsWith('#'))) {
      // 開新區塊：把 pending 當作此區塊的前置註解（去掉首尾空行）。
      const comments = pending.slice();
      while (comments.length && comments[0]!.trim() === '') comments.shift();
      while (comments.length && comments[comments.length - 1]!.trim() === '') comments.pop();
      cur = { id: newId(), name: '', action: first as BlockAction, enabled: true, conditions: [], style: {} };
      if (headerRest) cur.headerComment = headerRest;
      if (comments.length) {
        cur.comments = comments;
        cur.name = nameFromComments(comments);
      }
      // 無分節註解時，用標頭尾註解的 $type/$tier 標記當卡片標題（去掉 # 與 %XX 配色碼）。
      if (!cur.name && headerRest) cur.name = headerRest.replace(/^#+\s*/, '').replace(/^%\S+\s*/, '').trim();
      pending = [];
      blocks.push(cur);
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('#')) {
      pending.push(line); // 註解 / 空行 → 暫存歸下一區塊
      continue;
    }

    // 內容行（條件 / 動作 / Continue）
    if (!cur) {
      // 還沒有任何區塊 → 連同 pending 併入 preamble（極少見的檔頭內容）。
      preamble.push(...pending, line);
      pending = [];
      continue;
    }
    flushPendingComments();

    if (first === 'Continue') {
      cur.cont = true;
      continue;
    }
    if (STYLE_KEYWORDS.has(first)) {
      const ok = applyStyleLine(cur.style, first, trimmed.slice(first.length).trim());
      if (!ok) (cur.unknown ??= []).push(trimmed);
      continue;
    }
    if (CONDITION_KEYWORDS.has(first)) {
      const m = CONDITION_RE.exec(trimmed);
      cur.conditions.push({ field: first, op: m?.[2] ?? '', value: (m?.[3] ?? '').trim() });
      continue;
    }
    // 不認得的條件/動作（如 HasInfluence / PlayAlertSoundPositional）→ 原樣保留。
    (cur.unknown ??= []).push(trimmed);
  }

  // 收尾：剩餘 pending。有區塊時，殘留註解歸最後一塊的 unknown；否則進 preamble。
  if (pending.length) {
    if (cur) flushPendingComments();
    else preamble.push(...pending);
  }
  // 去掉 preamble 尾端空行
  while (preamble.length && preamble[preamble.length - 1]!.trim() === '') preamble.pop();

  return { preamble, blocks };
}

// ── 持久化（localStorage）─────────────────────────────────────────────────────

const STORAGE_KEY = 'poe-filter-blocks-v1';
let SEQ = 1;
export function newId(): string {
  return `b${Date.now().toString(36)}_${SEQ++}`;
}

export function emptyBlock(action: BlockAction = 'Show'): FilterBlock {
  return { id: newId(), name: '新規則', action, enabled: true, conditions: [], style: {} };
}

/** 載入已存規則；沒有存檔則回空陣列（不預載示範/測試資料，由使用者新增或讀取）。 */
export function loadBlocks(): FilterBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FilterBlock[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* 損毀則回空 */
  }
  return [];
}

export function saveBlocks(blocks: FilterBlock[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
  } catch {
    /* 配額/隱私模式：忽略 */
  }
}
