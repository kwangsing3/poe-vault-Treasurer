// 產生「繁中 ↔ 英文」物品/通貨/詞綴對照表。
//
// 資料來源（皆為官方 trade data 端點快照）：
//   繁中（台服）：mock/trade-data/{items,static,stats}.json
//   英文（國際）：mock/trade-data/en/{items,static,stats}.json
//
// 對齊策略：
//   - static（通貨）/ stats（詞綴）：entries 帶語言無關 `id` → 直接 by id join（高信心）。
//   - items（裝備基底/傳奇）：entries 無逐筆 id → 以分類 `id` 分組後「位置對齊」。
//       分類筆數相同(eq) → 高信心；筆數不同(diff) → 標 low，需 POEDB 佐證。
//
// 輸出：data/name-map/{currency,stats,items}.json + REPORT.md
//
// 執行：node scripts/build-name-map.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TW = (f) => path.join(ROOT, 'mock', 'trade-data', f);
const EN = (f) => path.join(ROOT, 'mock', 'trade-data', 'en', f);
const OUT = path.join(ROOT, 'data', 'name-map');
mkdirSync(OUT, { recursive: true });

const load = (p) => JSON.parse(readFileSync(p, 'utf8')).result;
const writeJson = (name, obj) =>
  writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');

// ── static / stats：by-id join ───────────────────────────────────────────────
// 兩者結構相同：result[].entries[] 帶 { id, text, ... }。
function buildById(twResult, enResult, extra = () => ({})) {
  const flatten = (res) => {
    const m = new Map();
    for (const g of res) for (const e of g.entries) if (e.id) m.set(e.id, { e, group: g });
    return m;
  };
  const tw = flatten(twResult);
  const en = flatten(enResult);
  const pairs = [];
  const onlyTw = [];
  const onlyEn = [];
  for (const [id, { e: te, group: tg }] of tw) {
    const hit = en.get(id);
    if (!hit) { onlyTw.push({ id, zh: te.text }); continue; }
    pairs.push({ id, zh: te.text, en: hit.e.text, ...extra(te, hit.e, tg, hit.group) });
  }
  for (const [id, { e: ee }] of en) if (!tw.has(id)) onlyEn.push({ id, en: ee.text });
  return { pairs, onlyTw, onlyEn };
}

// ── items：分類分組 + base/unique 拆分位置對齊 ────────────────────────────────
// items entries 無逐筆 id，但兩服 entries 依「相同內部順序」排列。
// 風險：整體筆數相同不代表對齊正確（base/unique 各差一筆可互相抵銷 → 靜默錯位）。
// 對策：(1) 拆 base / unique 兩子序列各自位置對齊，子序列筆數相同才標 high；
//       (2) `disc`（語言無關修飾標，如 legacy）若同位置不一致 → 該筆降為 low 並標 discMismatch。
const isUnique = (e) => !!(e.name || (e.flags && e.flags.unique));

function entryPair(te, ee) {
  if (te.name || ee.name) {
    return { kind: 'unique', zh: te.name ?? te.type, en: ee.name ?? ee.type, zhBase: te.type, enBase: ee.type };
  }
  return { kind: 'base', zh: te.type, en: ee.type };
}

/** 對齊單一子序列（皆 base 或皆 unique）。子序列筆數一致才視為高信心。 */
function alignSub(twList, enList) {
  const eq = twList.length === enList.length;
  const n = Math.min(twList.length, enList.length);
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const te = twList[i], ee = enList[i];
    const discMismatch = (te.disc ?? null) !== (ee.disc ?? null);
    const p = { ...entryPair(te, ee), confidence: eq && !discMismatch ? 'high' : 'low' };
    if (discMismatch) p.discMismatch = true;
    if (te.disc) p.disc = te.disc;
    pairs.push(p);
  }
  return { eq, mapped: n, pairs };
}

function buildItems(twResult, enResult) {
  const twById = new Map(twResult.map((g) => [g.id, g]));
  const enById = new Map(enResult.map((g) => [g.id, g]));
  const ids = [...new Set([...twById.keys(), ...enById.keys()])];
  const categories = [];
  for (const id of ids) {
    const a = twById.get(id);
    const b = enById.get(id);
    if (!a || !b) {
      categories.push({
        id, status: a ? 'only-tw' : 'only-en',
        labelZh: a?.label ?? null, labelEn: b?.label ?? null,
        baseTw: a ? a.entries.filter((e) => !isUnique(e)).length : 0,
        baseEn: b ? b.entries.filter((e) => !isUnique(e)).length : 0,
        uniqueTw: a ? a.entries.filter(isUnique).length : 0,
        uniqueEn: b ? b.entries.filter(isUnique).length : 0,
        pairs: [],
      });
      continue;
    }
    const aBase = a.entries.filter((e) => !isUnique(e));
    const aUniq = a.entries.filter(isUnique);
    const bBase = b.entries.filter((e) => !isUnique(e));
    const bUniq = b.entries.filter(isUnique);
    const base = alignSub(aBase, bBase);
    const uniq = alignSub(aUniq, bUniq);
    const pairs = [...base.pairs, ...uniq.pairs];
    categories.push({
      id,
      status: base.eq && uniq.eq ? 'eq' : 'diff',
      labelZh: a.label, labelEn: b.label,
      baseTw: aBase.length, baseEn: bBase.length, baseAligned: base.eq,
      uniqueTw: aUniq.length, uniqueEn: bUniq.length, uniqueAligned: uniq.eq,
      pairs,
    });
  }
  return categories;
}

// ── POEDB 佐證：用 zh→en 字典覆寫 items 英文、命中者升為 high ───────────────────
// 來源：data/name-map/poedb-dict.json（由 scripts/harvest-poedb.mjs 產生）。
// POEDB 的 /tw/ 與 /us/ 是同一份 GGPK 的兩個語言版（筆數/順序一致），slug join 後的 zh↔en
// 是權威對映 → 直接以 zh 名查英文，解決 trade 兩服筆數不同造成的位置錯位。
function reconcileWithPoedb(categories) {
  const dictPath = path.join(OUT, 'poedb-dict.json');
  if (!existsSync(dictPath)) return { applied: false };
  const dict = JSON.parse(readFileSync(dictPath, 'utf8'));
  const baseZhToEn = new Map();
  const baseConflict = new Set();
  for (const b of dict.bases ?? []) {
    if (baseZhToEn.has(b.zh) && baseZhToEn.get(b.zh) !== b.en) baseConflict.add(b.zh);
    baseZhToEn.set(b.zh, b.en);
  }
  const uniqZhTo = new Map();
  const uniqConflict = new Set();
  for (const u of dict.uniques ?? []) {
    if (uniqZhTo.has(u.zh) && uniqZhTo.get(u.zh).en !== u.en) uniqConflict.add(u.zh);
    uniqZhTo.set(u.zh, { en: u.en, enBase: u.enBase });
  }
  // 反向索引：以英文名查權威繁中（修正位置錯位時，zh 可能是錯的，但 en 多半可靠）。
  const baseEnToZh = new Map();
  for (const b of dict.bases ?? []) if (!baseEnToZh.has(b.en)) baseEnToZh.set(b.en, b.zh);
  const uniqEnToZh = new Map();
  for (const u of dict.uniques ?? []) if (!uniqEnToZh.has(u.en)) uniqEnToZh.set(u.en, { zh: u.zh, zhBase: u.zhBase });

  let upgraded = 0, corrected = 0, covered = 0, viaEn = 0;
  for (const c of categories) {
    for (const p of c.pairs) {
      // 第一輪：以繁中查英文（解決英文側位置錯位）。
      const hit = p.kind === 'unique' ? uniqZhTo.get(p.zh) : baseZhToEn.get(p.zh);
      const conflicted = p.kind === 'unique' ? uniqConflict.has(p.zh) : baseConflict.has(p.zh);
      if (hit && !conflicted) {
        const en = p.kind === 'unique' ? hit.en : hit;
        if (p.en !== en) corrected++;
        p.en = en;
        if (p.kind === 'unique' && hit.enBase) p.enBase = hit.enBase;
        if (p.confidence !== 'high') upgraded++;
        p.confidence = 'high'; p.source = 'poedb'; delete p.discMismatch; covered++;
        continue;
      }
      // 第二輪：以英文查繁中（解決繁中側位置錯位，zh 是錯的位置猜測）。
      const enHit = p.kind === 'unique' ? uniqEnToZh.get(p.en) : baseEnToZh.get(p.en);
      if (enHit) {
        const zh = p.kind === 'unique' ? enHit.zh : enHit;
        if (p.zh !== zh) corrected++;
        p.zh = zh;
        if (p.kind === 'unique' && enHit.zhBase) p.zhBase = enHit.zhBase;
        if (p.confidence !== 'high') upgraded++;
        p.confidence = 'high'; p.source = 'poedb'; delete p.discMismatch; covered++; viaEn++;
        continue;
      }
      p.source = 'positional';
    }
  }
  return {
    applied: true, upgraded, corrected, covered, viaEn,
    dictBases: baseZhToEn.size, dictUniques: uniqZhTo.size,
    conflicts: baseConflict.size + uniqConflict.size,
  };
}

// ── 跑 ───────────────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 10);

const currency = buildById(load(TW('static.json')), load(EN('static.json')), (te, ee, tg) => ({ group: tg.id }));
writeJson('currency.json', {
  meta: { generated: stamp, source: 'trade/data/static', join: 'by entry id', count: currency.pairs.length },
  ...currency,
});

const stats = buildById(load(TW('stats.json')), load(EN('stats.json')), (te) => ({ type: te.type }));
writeJson('stats.json', {
  meta: { generated: stamp, source: 'trade/data/stats', join: 'by entry id', count: stats.pairs.length },
  ...stats,
});

const itemCats = buildItems(load(TW('items.json')), load(EN('items.json')));
const recon = reconcileWithPoedb(itemCats);

// ── 地圖：常規地圖已無逐個 base type（現為 T1–T16 階級），只有傳奇地圖固定具名。 ──
// trade/data/items 的 map 分類保留大量「已移除舊地圖基底 + 數字 id 凋落變體 + 非地圖雜項」，
// 這些在現版本不存在、無法（也不需）逐名對映。標為 excluded：非缺口，filter 改用 Class "Maps" + MapTier。
// 只有 kind:unique（32 個固定傳奇地圖）保留為可用對照。
const mapCat = itemCats.find((c) => c.id === 'map');
let mapExcluded = 0;
if (mapCat) {
  for (const p of mapCat.pairs) {
    if (p.kind !== 'unique') { p.excluded = 'legacy-or-tierless'; mapExcluded++; }
  }
  mapCat.note = `常規地圖無 base type（用 MapTier 1–16）；${mapExcluded} 筆 legacy base 已標 excluded，僅保留 ${mapCat.pairs.length - mapExcluded} 個傳奇地圖。`;
}

const itemPairCount = itemCats.reduce((s, c) => s + c.pairs.length, 0);
const highCount = itemCats.reduce((s, c) => s + c.pairs.filter((p) => p.confidence === 'high').length, 0);
const poedbCount = itemCats.reduce((s, c) => s + c.pairs.filter((p) => p.source === 'poedb').length, 0);
writeJson('items.json', {
  meta: {
    generated: stamp, source: 'trade/data/items',
    join: recon.applied ? 'category id + positional, reconciled via POEDB zh→en' : 'by category id + positional',
    totalPairs: itemPairCount, highConfidencePairs: highCount, poedbVerified: poedbCount,
    mapLegacyExcluded: mapExcluded,
    poedb: recon,
  },
  categories: itemCats,
});

// ── 報告 ───────────────────────────────────────────────────────────────────────
const fmtCat = (c) =>
  `| ${c.id} | ${c.labelZh ?? '-'} | ${c.labelEn ?? '-'} | ${c.baseTw}/${c.baseEn} | ${c.uniqueTw}/${c.uniqueEn} | ${c.status} | ${c.pairs.length} |`;
const report = `# 中英對照表產生報告

> 由 \`scripts/build-name-map.mjs\` 產生（${stamp}）。資料源：官方 trade data 端點快照（台服 + 國際版）。

## 通貨（currency，trade/data/static）
- 以逐筆 \`id\` 對齊（語言無關，**高信心**）。
- 對到：**${currency.pairs.length}** 筆；只台服：${currency.onlyTw.length}；只國際：${currency.onlyEn.length}。

## 詞綴（stats，trade/data/stats）
- 以逐筆 \`id\` 對齊（語言無關，**高信心**）。
- 對到：**${stats.pairs.length}** 筆；只台服：${stats.onlyTw.length}；只國際：${stats.onlyEn.length}。

## 裝備（items，trade/data/items）
- 以分類 \`id\` 分組，再把每分類拆 **base / unique** 兩子序列各自位置對齊。
- 子序列筆數一致且 \`disc\` 不衝突 → \`high\`；否則 \`low\`（位置對齊可能錯位，**需 POEDB 佐證**）。
- 對到合計：**${itemPairCount}** 筆，其中 **高信心 = ${highCount}** 筆。
- 注意：整體筆數相同 ≠ 對齊正確（base/unique 各差一筆會互相抵銷）。本表已用拆分避免此陷阱。
${recon.applied ? `- **POEDB 佐證已套用**：以 \`poedb-dict.json\` 的 zh→en 覆寫，**${recon.poedbVerified ?? poedbCount}** 筆經 POEDB 驗證（其中修正位置錯位 ${recon.corrected} 筆、low→high 升級 ${recon.upgraded} 筆；字典 base ${recon.dictBases}/unique ${recon.dictUniques}，名稱衝突 ${recon.conflicts}）。逐筆 \`source\` 標 \`poedb\` 或 \`positional\`。` : '- **POEDB 佐證尚未套用**（缺 `poedb-dict.json`，跑 `node scripts/harvest-poedb.mjs` 後重跑本腳本）。'}

| 分類 id | 繁中 | 英文 | base(tw/en) | unique(tw/en) | 狀態 | 已對映 |
|---|---|---|---|---|---|---|
${itemCats.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id)).map(fmtCat).join('\n')}

### 後續（diff 分類）
建議用 POEDB（https://poedb.tw，雙語 + 內部 metadata id）逐一核對 \`diff\` 分類（優先 armour / accessory / gem / map），
或改以 POEDB / GGPK 解包作為 items 的主來源。currency 與 stats 已是高信心，無需處理。
`;
writeFileSync(path.join(OUT, 'REPORT.md'), report, 'utf8');

console.log('currency pairs:', currency.pairs.length, '| onlyTw:', currency.onlyTw.length, '| onlyEn:', currency.onlyEn.length);
console.log('stats    pairs:', stats.pairs.length, '| onlyTw:', stats.onlyTw.length, '| onlyEn:', stats.onlyEn.length);
console.log('items    pairs:', itemPairCount, '| high:', highCount, '| poedb-verified:', poedbCount);
if (recon.applied) console.log('  POEDB recon -> covered:', recon.covered, 'upgraded:', recon.upgraded, 'corrected:', recon.corrected, 'conflicts:', recon.conflicts);
else console.log('  POEDB recon -> (poedb-dict.json 不存在，略過)');
console.log('output ->', path.relative(ROOT, OUT));
