// 倉庫頁「套用物品過濾器」的評估引擎（顯示層預覽，與遊戲無關）。
//
// 給一件 StashItem 與規則 FilterBlock[]，由上而下比對（區塊內條件 AND、值之間 OR、
// first-match-wins；帶 Continue 者疊加樣式後續查）。回傳命中區塊的 action + 疊加樣式。
//
// 條件來源有二：結構化的 b.conditions，以及 b.unknown 裡的進階條件行（如 HasInfluence）。
// 支援的條件逐一比對；遇到「不支援的條件」一律讓該區塊不命中（保守：寧可不上色，也不誤上色）。
import type { FilterBlock, Style } from './filter';
import type { StashItem } from './stash';
import baseMetaRaw from './base-meta.json';

const baseMeta = baseMetaRaw as Record<string, { en: string; cls: string }>;

// 動作關鍵字（出現在 unknown 行時忽略，不影響比對）。
const ACTIONS = new Set<string>([
  'SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'SetFontSize', 'PlayAlertSound',
  'PlayAlertSoundPositional', 'CustomAlertSound', 'CustomAlertSoundOptional', 'DisableDropSound',
  'EnableDropSound', 'DisableDropSoundIfAlertSound', 'EnableDropSoundIfAlertSound', 'MinimapIcon', 'PlayEffect',
]);

// 條件關鍵字全集（用來判斷某行是不是「條件」；不在此集合且非動作者忽略）。
const CONDITIONS = new Set<string>([
  'AlternateQuality', 'AnyEnchantment', 'AreaLevel', 'ArchnemesisMod', 'BaseArmour', 'BaseDefencePercentile',
  'BaseEnergyShield', 'BaseEvasion', 'BaseType', 'BaseWard', 'BlightedMap', 'Class', 'Corrupted', 'CorruptedMods',
  'DropLevel', 'ElderItem', 'ElderMap', 'EnchantmentPassiveNode', 'EnchantmentPassiveNum', 'FracturedItem',
  'GemLevel', 'GemQualityType', 'HasCruciblePassiveTree', 'HasEaterOfWorldsImplicit', 'HasEnchantment',
  'HasExplicitMod', 'HasImplicitMod', 'HasInfluence', 'HasSearingExarchImplicit', 'HasVaalUniqueMod', 'Height',
  'Identified', 'ItemLevel', 'LinkedSockets', 'MapTier', 'Mirrored', 'Quality', 'Rarity', 'Replica', 'Scourged',
  'ShaperItem', 'ShapedMap', 'SocketGroup', 'Sockets', 'StackSize', 'SynthesisedItem', 'TransfiguredGem',
  'UberBlightedMap', 'Width', 'ZanaMemory', 'MemoryStrands', 'Foulborn', 'Imbued',
]);

const RARITY_RANK: Record<string, number> = { Normal: 0, Magic: 1, Rare: 2, Unique: 3 };

interface ItemView {
  cls: string;
  enBase: string;
  zhBase: string;
  rarityRank: number | undefined;
  ilvl: number | undefined;
  stack: number | undefined;
  quality: number | undefined;
  socketCount: number;
  socketColors: string[];
  links: number;
  mapTier: number | undefined;
  width: number;
  height: number;
  corrupted: boolean;
  identified: boolean;
  mirrored: boolean;
  fractured: boolean;
  synthesised: boolean;
  replica: boolean;
  influences: string[];
}

/** 缺 base-meta 時用 frameType / 名稱推粗分類。 */
function coarseClass(it: StashItem): string {
  if (it.base.includes('地圖')) return 'Maps';
  if (it.frame === 4) return 'Skill Gems';
  if (it.frame === 5) return 'Currency';
  if (it.frame === 6) return 'Divination Card';
  return '';
}

function rarityRank(r: string): number | undefined {
  switch (r) {
    case 'normal': return 0;
    case 'magic': return 1;
    case 'rare': return 2;
    case 'unique': return 3;
    default: return undefined; // currency / gem 等不參與稀有度比對
  }
}

function toView(it: StashItem): ItemView {
  const meta = baseMeta[it.base];
  const mapTierMatch = /階級\s*(\d+)/.exec(it.base);
  return {
    cls: meta?.cls || coarseClass(it),
    enBase: meta?.en || it.base,
    zhBase: it.base,
    rarityRank: rarityRank(it.rarity),
    ilvl: it.ilvl,
    stack: it.stack,
    quality: it.quality,
    socketCount: it.socketColors?.length ?? 0,
    socketColors: it.socketColors ?? [],
    links: it.links ?? 0,
    mapTier: mapTierMatch ? Number(mapTierMatch[1]) : undefined,
    width: it.w,
    height: it.h,
    corrupted: it.corrupted ?? false,
    identified: it.identified ?? false,
    mirrored: it.mirrored ?? false,
    fractured: it.fractured ?? false,
    synthesised: it.synthesised ?? false,
    replica: it.replica ?? false,
    influences: it.influences ?? [],
  };
}

// ── 值與比較工具 ──────────────────────────────────────────────────────────────
function tokens(value: string): string[] {
  return (value.match(/"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/"/g, ''));
}

function strMatch(vals: string[], op: string, targets: string[]): boolean {
  const t = targets.filter(Boolean).map((s) => s.toLowerCase());
  const lower = vals.map((v) => v.toLowerCase());
  const hit = lower.some((v) => (op === '==' ? t.some((x) => x === v) : t.some((x) => x.includes(v))));
  return op === '!' || op === '!=' ? !hit : hit;
}

function numCmp(itemVal: number | undefined, op: string, ruleVal: number): boolean {
  if (itemVal === undefined || Number.isNaN(ruleVal)) return false;
  switch (op) {
    case '': case '=': case '==': return itemVal === ruleVal;
    case '!': case '!=': return itemVal !== ruleVal;
    case '>': return itemVal > ruleVal;
    case '<': return itemVal < ruleVal;
    case '>=': return itemVal >= ruleVal;
    case '<=': return itemVal <= ruleVal;
    default: return false;
  }
}

function boolCmp(flag: boolean, op: string, value: string): boolean {
  const want = tokens(value)[0];
  const b = want === undefined ? true : want.toLowerCase() === 'true';
  return op === '!' || op === '!=' ? flag !== b : flag === b;
}

const COLORS = 'RGBWAD';
function socketMatch(view: ItemView, op: string, value: string): boolean {
  // 例：">= 6" / "6" / "RGB" / "5RRG"。取前導整數為數量、字母為顏色需求。
  const raw = value.trim();
  const numM = /(\d+)/.exec(raw);
  const colors = (raw.match(/[RGBWAD]/gi) ?? []).map((c) => c.toUpperCase());
  if (numM) {
    if (!numCmp(view.socketCount, op || '>=', Number(numM[1]))) return false;
  }
  for (const c of colors) {
    if (!COLORS.includes(c)) continue;
    const need = colors.filter((x) => x === c).length;
    const have = view.socketColors.filter((x) => x.toUpperCase() === c).length;
    if (have < need) return false;
  }
  return true;
}

type CondResult = 'pass' | 'fail' | 'unsupported';

function evalCond(field: string, op: string, value: string, v: ItemView): CondResult {
  const ok = (b: boolean): CondResult => (b ? 'pass' : 'fail');
  switch (field) {
    case 'Class': return ok(strMatch(tokens(value), op, [v.cls]));
    case 'BaseType': return ok(strMatch(tokens(value), op, [v.enBase, v.zhBase]));
    case 'Rarity': {
      const want = RARITY_RANK[tokens(value)[0] ?? ''];
      if (want === undefined || v.rarityRank === undefined) return 'fail';
      return ok(numCmp(v.rarityRank, op, want));
    }
    case 'ItemLevel': return ok(numCmp(v.ilvl, op, Number(tokens(value)[0])));
    case 'StackSize': return ok(numCmp(v.stack, op, Number(tokens(value)[0])));
    case 'Quality': return ok(numCmp(v.quality, op, Number(tokens(value)[0])));
    case 'LinkedSockets': return ok(numCmp(v.links, op, Number(tokens(value)[0])));
    case 'MapTier': return ok(numCmp(v.mapTier, op, Number(tokens(value)[0])));
    case 'Width': return ok(numCmp(v.width, op, Number(tokens(value)[0])));
    case 'Height': return ok(numCmp(v.height, op, Number(tokens(value)[0])));
    case 'Sockets': case 'SocketGroup': return ok(socketMatch(v, op, value));
    case 'Corrupted': return ok(boolCmp(v.corrupted, op, value));
    case 'Identified': return ok(boolCmp(v.identified, op, value));
    case 'Mirrored': return ok(boolCmp(v.mirrored, op, value));
    case 'FracturedItem': return ok(boolCmp(v.fractured, op, value));
    case 'SynthesisedItem': return ok(boolCmp(v.synthesised, op, value));
    case 'Replica': return ok(boolCmp(v.replica, op, value));
    case 'HasInfluence': {
      const vals = tokens(value);
      const hit = vals.includes('None') ? v.influences.length === 0 : vals.some((x) => v.influences.includes(x));
      return ok(op === '!' || op === '!=' ? !hit : hit);
    }
    default:
      return 'unsupported'; // 其餘條件（HasExplicitMod / DropLevel / GemLevel…）無法比對
  }
}

const COND_RE = /^(\S+)\s*(==|!=|>=|<=|=|!|<|>)?\s*(.*)$/;

/** 蒐集區塊所有條件（結構化 + unknown 行裡的條件），逐一比對；全 pass 才命中。 */
function blockMatches(b: FilterBlock, v: ItemView): boolean {
  for (const c of b.conditions) {
    if (evalCond(c.field, c.op, c.value, v) !== 'pass') return false;
  }
  for (const line of b.unknown ?? []) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = COND_RE.exec(trimmed);
    const field = m?.[1] ?? '';
    if (ACTIONS.has(field)) continue; // 動作行：不影響比對
    if (!CONDITIONS.has(field)) continue; // 非條件（罕見）：忽略
    if (evalCond(field, m?.[2] ?? '', (m?.[3] ?? '').trim(), v) !== 'pass') return false;
  }
  return true;
}

export interface FilterMatch {
  action: 'Show' | 'Hide' | 'Minimal';
  style: Style;
}

/** 對一件物品套用規則：回傳命中區塊的 action + 疊加樣式；無命中回 null。 */
export function matchItem(it: StashItem, blocks: FilterBlock[]): FilterMatch | null {
  const v = toView(it);
  let style: Style = {};
  let action: 'Show' | 'Hide' | 'Minimal' | null = null;
  for (const b of blocks) {
    if (!b.enabled) continue;
    if (!blockMatches(b, v)) continue;
    style = { ...style, ...b.style }; // 後者覆蓋前者
    action = b.action;
    if (!b.cont) break; // 無 Continue → 此為最終命中
  }
  return action ? { action, style } : null;
}
