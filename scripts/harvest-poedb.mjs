// 從 POEDB（poedb.tw）的「每物品分類」頁面，收割「繁中 ↔ 英文」物品名稱對照表。
//
// 原理（slug-join，高信心）：
//   POEDB 的 /tw/<Class> 與 /us/<Class> 兩頁渲染同一份 GGPK 資料、只是換語言，
//   所以列出的物品完全相同；且每件物品都以「語言無關的 slug」連結
//   （英文衍生，如 Blue_Pearl_Amulet、Astramentis）。
//   → 同一 slug 在 tw 頁的文字是繁中名、在 us 頁的文字是英文名，直接 inner-join 即得對照。
//   這避開了 trade-API 的痛點（台服 vs 國際服物品筆數不同、無逐筆 id 而需位置對齊）。
//
// 資料來源：先用 curl（瀏覽器 UA）把每個分類的 /us/ 與 /tw/ HTML 存到本機，本腳本只做解析+join。
//   存放：HTML_DIR/{us,tw}/<Class>.html
//
// 解析規則（以實際 POEDB HTML 驗證；用正則，環境無 DOM）：
//   1) 基底物品（BASE）：<a class="whiteitem ..."（或 itemclass_map ... 的地圖基底）
//        href 為「裸 slug」（無前導斜線），inner text 為顯示名。
//        例：<a class="whiteitem Amulet" ... href="Blue_Pearl_Amulet">碧珠護身符</a>
//        （排除 class=PassiveSkills / ItemClasses / UniqueItems 等噪音裸 slug 連結。）
//   2) 傳奇物品（UNIQUE）：href 為 /tw/<Slug> 或 /us/<Slug>，inner 含兩個 span：
//        <a href="/us/Astramentis"><span class="uniqueName">Astramentis</span>
//                                   <span class="uniqueTypeLine">Onyx Amulet</span></a>
//        取 slug、uniqueName（名）、uniqueTypeLine（基底）。同 slug 可能出現多次（圖示+文字），
//        依 slug 去重。
//
// 輸出：data/name-map/poedb-dict.json（bases / uniques，依 class→slug 排序、各自去重）。
//
// 執行：
//   1) 先抓 HTML（見腳本內 CLASSES；範例 curl 指令於本檔頂註解）。
//   2) node scripts/harvest-poedb.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_DIR = process.env.POEDB_HTML_DIR || '/tmp/poedb';
const OUT_DIR = path.join(ROOT, 'data', 'name-map');
mkdirSync(OUT_DIR, { recursive: true });

// 要嘗試的分類（slug）。404 會自動跳過並記錄。
const CLASSES = [
  'Amulets', 'Rings', 'Belts',
  'Body_Armours', 'Helmets', 'Gloves', 'Boots', 'Shields', 'Quivers',
  'One_Hand_Swords', 'Two_Hand_Swords', 'One_Hand_Axes', 'Two_Hand_Axes',
  'One_Hand_Maces', 'Two_Hand_Maces', 'Bows', 'Wands', 'Daggers', 'Claws',
  'Sceptres', 'Staves', 'Warstaves', 'Rune_Daggers', 'Thrusting_One_Hand_Swords',
  'Fishing_Rods',
  'Skill_Gems', 'Support_Gems',
  'Maps', 'Flasks',
  'Jewels', 'Abyss_Jewels', 'Cluster_Jewel',
];

// HTML 實體解碼（POEDB 文字裡常見 &amp; &#39; &quot; 等）。
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

const clean = (s) => decodeEntities(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// ── 解析 BASE 物品 ──────────────────────────────────────────────────────────
// 鎖定 class 以 whiteitem 或 itemclass_map 開頭、href 為裸 slug、inner 為純文字的 <a>。
const BASE_RE =
  /<a class="(whiteitem|itemclass_map)[^"]*"[^>]*\shref="([A-Za-z0-9_%.,'+-]+)"[^>]*>([^<]*)<\/a>/g;

function parseBases(html) {
  const map = new Map(); // slug -> text（首見即留；同頁同 slug 文字一致）
  let m;
  BASE_RE.lastIndex = 0;
  while ((m = BASE_RE.exec(html))) {
    const slug = m[2];
    const text = clean(m[3]);
    if (!text) continue;
    if (!map.has(slug)) map.set(slug, text);
  }
  return map;
}

// ── 解析 GEM（技能/輔助寶石）─────────────────────────────────────────────────
// 寶石 anchor 不走 whiteitem，而是 class="gem_red|blue|green|white"，href="/<lang>/<Slug>"，
// inner 為單一純文字。在 trade 裡寶石屬 base kind，故併入 bases。
//   例：<a class="gem_red" ... href="/us/Cleave">Cleave</a> / href="/tw/Cleave">劈砍</a>
const GEM_RE =
  /<a class="gem_(?:red|blue|green|white)"[^>]*\shref="\/(?:tw|us)\/([A-Za-z0-9_%.,'+-]+)"[^>]*>([^<]*)<\/a>/g;

function parseGems(html) {
  const map = new Map(); // slug -> text
  let m;
  GEM_RE.lastIndex = 0;
  while ((m = GEM_RE.exec(html))) {
    const slug = m[1];
    const text = clean(m[2]);
    if (!text) continue;
    if (!map.has(slug)) map.set(slug, text);
  }
  return map;
}

// ── 解析 UNIQUE 物品 ────────────────────────────────────────────────────────
// href="/<lang>/<Slug>"，inner 兩個 span：uniqueName + uniqueTypeLine。
const UNIQUE_RE =
  /href="\/(?:tw|us)\/([A-Za-z0-9_%.,'+-]+)"[^>]*>\s*<span class="uniqueName">([^<]*)<\/span>\s*<span class="uniqueTypeLine">([^<]*)<\/span>/g;

function parseUniques(html) {
  const map = new Map(); // slug -> { name, base }
  let m;
  UNIQUE_RE.lastIndex = 0;
  while ((m = UNIQUE_RE.exec(html))) {
    const slug = m[1];
    const name = clean(m[2]);
    const base = clean(m[3]);
    if (!name) continue;
    // 同 slug 多次出現時，偏好「name 與 base 皆有」的那筆。
    const prev = map.get(slug);
    if (!prev || (!prev.base && base)) map.set(slug, { name, base });
  }
  return map;
}

// ── 跑：逐分類讀 us/tw、解析、依 slug join ─────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10);
const fetched = [];
const skipped = [];

const baseRows = [];
const uniqueRows = [];

// 覆蓋率缺口統計（slug 只在單一語言出現）。
let baseTwOnly = 0, baseUsOnly = 0, uniqTwOnly = 0, uniqUsOnly = 0;
const baseTwOnlyEx = [], baseUsOnlyEx = [], uniqTwOnlyEx = [], uniqUsOnlyEx = [];

for (const cls of CLASSES) {
  const usPath = path.join(HTML_DIR, 'us', `${cls}.html`);
  const twPath = path.join(HTML_DIR, 'tw', `${cls}.html`);
  if (!existsSync(usPath) || !existsSync(twPath)) {
    skipped.push(cls);
    continue;
  }
  const usHtml = readFileSync(usPath, 'utf8');
  const twHtml = readFileSync(twPath, 'utf8');
  // POEDB 的 404 也回 200 但內容是錯誤頁；用「有無解析到任何物品」當作有效判準。
  const usBases = parseBases(usHtml);
  const twBases = parseBases(twHtml);
  // 寶石頁的物品走 gem anchor，併入 bases。
  for (const [slug, text] of parseGems(usHtml)) if (!usBases.has(slug)) usBases.set(slug, text);
  for (const [slug, text] of parseGems(twHtml)) if (!twBases.has(slug)) twBases.set(slug, text);
  const usUniques = parseUniques(usHtml);
  const twUniques = parseUniques(twHtml);
  if (usBases.size === 0 && usUniques.size === 0 && twBases.size === 0 && twUniques.size === 0) {
    skipped.push(cls);
    continue;
  }
  fetched.push(cls);

  // BASE join by slug
  for (const [slug, en] of usBases) {
    const zh = twBases.get(slug);
    if (zh == null) { baseUsOnly++; if (baseUsOnlyEx.length < 8) baseUsOnlyEx.push(`${cls}:${slug}`); continue; }
    baseRows.push({ slug, zh, en, class: cls });
  }
  for (const slug of twBases.keys()) {
    if (!usBases.has(slug)) { baseTwOnly++; if (baseTwOnlyEx.length < 8) baseTwOnlyEx.push(`${cls}:${slug}`); }
  }

  // UNIQUE join by slug
  for (const [slug, en] of usUniques) {
    const zh = twUniques.get(slug);
    if (zh == null) { uniqUsOnly++; if (uniqUsOnlyEx.length < 8) uniqUsOnlyEx.push(`${cls}:${slug}`); continue; }
    uniqueRows.push({ slug, zh: zh.name, en: en.name, zhBase: zh.base, enBase: en.base, class: cls });
  }
  for (const slug of twUniques.keys()) {
    if (!usUniques.has(slug)) { uniqTwOnly++; if (uniqTwOnlyEx.length < 8) uniqTwOnlyEx.push(`${cls}:${slug}`); }
  }
}

// 全域去重（同一 slug 可能在多個分類出現，如地圖基底）：bases / uniques 各自以 slug 去重。
function dedupeBySlug(rows) {
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.slug)) seen.set(r.slug, r);
  return [...seen.values()];
}
const bases = dedupeBySlug(baseRows).sort(
  (a, b) => a.class.localeCompare(b.class) || a.slug.localeCompare(b.slug),
);
const uniques = dedupeBySlug(uniqueRows).sort(
  (a, b) => a.class.localeCompare(b.class) || a.slug.localeCompare(b.slug),
);

const out = {
  meta: {
    generated: stamp,
    source: 'poedb.tw /tw/ + /us/ per-class pages',
    join: 'language-independent URL slug',
    classesFetched: fetched,
    classesSkipped: skipped,
    counts: { bases: bases.length, uniques: uniques.length },
    coverageGaps: {
      basesTwOnly: baseTwOnly, basesUsOnly: baseUsOnly,
      uniquesTwOnly: uniqTwOnly, uniquesUsOnly: uniqUsOnly,
    },
  },
  bases,
  uniques,
};

writeFileSync(path.join(OUT_DIR, 'poedb-dict.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

// ── 主控台摘要 ────────────────────────────────────────────────────────────────
console.log('fetched classes:', fetched.length, '| skipped:', skipped.length, skipped.join(',') || '(none)');
console.log('bases joined  :', bases.length);
console.log('uniques joined:', uniques.length);
console.log('coverage gaps : bases tw-only', baseTwOnly, 'us-only', baseUsOnly,
  '| uniques tw-only', uniqTwOnly, 'us-only', uniqUsOnly);
if (baseTwOnlyEx.length) console.log('  base tw-only ex:', baseTwOnlyEx.join(', '));
if (baseUsOnlyEx.length) console.log('  base us-only ex:', baseUsOnlyEx.join(', '));
if (uniqTwOnlyEx.length) console.log('  uniq tw-only ex:', uniqTwOnlyEx.join(', '));
if (uniqUsOnlyEx.length) console.log('  uniq us-only ex:', uniqUsOnlyEx.join(', '));

// 每分類筆數
const byClass = {};
for (const r of bases) (byClass[r.class] ??= { base: 0, uniq: 0 }).base++;
for (const r of uniques) (byClass[r.class] ??= { base: 0, uniq: 0 }).uniq++;
console.log('\nper-class (base/unique):');
for (const c of Object.keys(byClass).sort())
  console.log(`  ${c.padEnd(28)} ${byClass[c].base}/${byClass[c].uniq}`);
