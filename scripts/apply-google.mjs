// 把 Google 驗證結果（.work/google_results.jsonl）整合進 items.json。
//   type "low"     → 以英文名更新現有 pair：覆寫 zh、confidence=high、source=google。
//   type "missing" → 新增 pair 到對應分類（kind 由 EN trade 推斷），標 added="google"。
// 僅採用 status verified|found 且 zh 非空者。冪等：可重跑。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const P = 'data/name-map/';
const items = JSON.parse(readFileSync(P + 'items.json', 'utf8'));
const enTrade = JSON.parse(readFileSync('mock/trade-data/en/items.json', 'utf8')).result;

// EN trade：en名 → {cat, kind, enBase}
const enInfo = new Map();
for (const g of enTrade) for (const e of g.entries) {
  const isU = !!(e.name || (e.flags && e.flags.unique));
  const key = e.name || e.type;
  if (!enInfo.has(key)) enInfo.set(key, { cat: g.id, kind: isU ? 'unique' : 'base', enBase: isU ? e.type : undefined });
}

const jl = P + '.work/google_results.jsonl';
if (!existsSync(jl)) { console.log('無 google_results.jsonl'); process.exit(0); }
const results = readFileSync(jl, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const catById = new Map(items.categories.map((c) => [c.id, c]));
let updatedLow = 0, addedMissing = 0, skipped = 0, addedPoedb = 0;
const pairByEn = new Map();
for (const c of items.categories) for (const p of c.pairs) if (!pairByEn.has(p.en)) pairByEn.set(p.en, { p, c });

// ── 先用 POEDB 字典補進「EN trade 有、對照表沒有」的現役物品（免搜尋，權威 slug 對照）。 ──
const dict = JSON.parse(readFileSync(P + 'poedb-dict.json', 'utf8'));
const pdEn = new Map();
for (const b of dict.bases) if (!pdEn.has(b.en)) pdEn.set(b.en, { zh: b.zh });
for (const u of dict.uniques) if (!pdEn.has(u.en)) pdEn.set(u.en, { zh: u.zh, zhBase: u.zhBase });
for (const [en, info] of enInfo) {
  if (pairByEn.has(en)) continue;
  const pd = pdEn.get(en);
  if (!pd) continue;
  const cat = catById.get(info.cat);
  if (!cat) continue;
  const np = { kind: info.kind, zh: pd.zh, en, confidence: 'high', source: 'poedb', added: 'poedb' };
  if (info.kind === 'unique' && info.enBase) np.enBase = info.enBase;
  if (info.kind === 'unique' && pd.zhBase) np.zhBase = pd.zhBase;
  cat.pairs.push(np);
  pairByEn.set(en, { p: np, c: cat });
  addedPoedb++;
}

for (const r of results) {
  if (!(r.status === 'verified' || r.status === 'found') || !r.zh) { skipped++; continue; }
  if (r.type === 'low') {
    const hit = pairByEn.get(r.en);
    if (!hit) { skipped++; continue; }
    hit.p.zh = r.zh; hit.p.confidence = 'high'; hit.p.source = 'google'; delete hit.p.discMismatch;
    updatedLow++;
  } else { // missing
    if (pairByEn.has(r.en)) { skipped++; continue; } // 已存在
    const info = enInfo.get(r.en) || { cat: r.cat, kind: 'unique' };
    const cat = catById.get(info.cat) || catById.get(r.cat);
    if (!cat) { skipped++; continue; }
    const np = { kind: info.kind, zh: r.zh, en: r.en, confidence: 'high', source: 'google', added: 'google' };
    if (info.kind === 'unique' && info.enBase) np.enBase = info.enBase;
    cat.pairs.push(np);
    pairByEn.set(r.en, { p: np, c: cat });
    addedMissing++;
  }
}
// ── 仍為 low、且非 excluded/冗餘/圖鑑/數字的「真實未解」項：標 unresolved 並清掉不可靠的 positional 中文。 ──
let unresolved = 0;
for (const c of items.categories) {
  if (c.id === 'currency' || c.id === 'monster') continue;
  for (const p of c.pairs) {
    if (p.confidence === 'high' || p.excluded || /^\d+$/.test(p.en)) continue;
    p.unresolved = 'not_found'; p.zh = null; unresolved++;
  }
}

const all = items.categories.flatMap((c) => c.pairs);
items.meta.unresolved = unresolved;
items.meta.totalPairs = all.length;
items.meta.highConfidencePairs = all.filter((p) => p.confidence === 'high').length;
items.meta.googleVerified = all.filter((p) => p.source === 'google').length;
items.meta.googleAdded = all.filter((p) => p.added === 'google').length;
writeFileSync(P + 'items.json', JSON.stringify(items, null, 2) + '\n', 'utf8');
console.log('POEDB補缺漏:', addedPoedb, '| low更新:', updatedLow, '| missing新增:', addedMissing, '| 跳過:', skipped);
console.log('total:', all.length, '| high:', items.meta.highConfidencePairs, '| google:', items.meta.googleVerified);

// ── 追加「Google/POEDB 補強」段到 REPORT.md（取代既有同名段，冪等）。 ──
const isNum = (s) => /^\d+$/.test((s || '').trim());
const eff = all.filter((p) => !p.excluded);
const effHigh = eff.filter((p) => p.confidence === 'high').length;
const section = `
## Google/POEDB 補強（apply-google.mjs）

- 由 \`scripts/apply-google.mjs\` 在 build 之後執行：用 POEDB 字典補現役缺漏、套用 \`.work/google_results.jsonl\` 的 Google 驗證結果。
- **新增缺漏**：POEDB 直接補 ${addedPoedb}、Google 補 ${addedMissing}。**low 修正升 high**：${updatedLow}。
- **來源分布**：poedb ${all.filter((p) => p.source === 'poedb').length}、google ${items.meta.googleVerified}、positional ${all.filter((p) => p.source === 'positional').length}。
- **有效對照**（排除 ${all.filter((p) => p.excluded).length} 筆 legacy 地圖 base）：${eff.length} 筆，其中 high ${effHigh}（${(effHigh / eff.length * 100).toFixed(1)}%）。
- **剩餘 low 性質**：currency 冗餘（用 \`currency.json\`）、monster 圖鑑（filter 不用）、legacy 舊地圖（excluded）。真實未解 = ${all.filter((p) => !p.excluded && p.confidence !== 'high' && !isNum(p.en)).filter((p) => { const cat = items.categories.find((c) => c.pairs.includes(p)); return cat && cat.id !== 'currency' && cat.id !== 'monster'; }).length} 筆（標 \`unresolved\`，多為 race/移除限定）。
- **EN-only legacy**（國際版有、現役台服無、無對應中文）：見 \`.work/legacy_en_only.json\`，屬已移除內容，非缺口。
`;
const RP = P + 'REPORT.md';
let rep = readFileSync(RP, 'utf8');
const marker = '## Google/POEDB 補強';
const idx = rep.indexOf(marker);
if (idx >= 0) rep = rep.slice(0, idx).trimEnd() + '\n';
writeFileSync(RP, rep.trimEnd() + '\n' + section, 'utf8');
console.log('REPORT.md 已更新補強段');
