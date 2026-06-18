// 把已驗證的 zh 修正套進 data/name-map/items.json。
// 來源（依序，後者可覆寫前者）：
//   1) POEDB 字典的 en→zh（本地、權威 slug join）—— 對所有 low/positional 以英文反查
//   2) .work/verified_batch1.json / verified_missing.json（Google 驗證，status=verified）
// 命中者：覆寫 zh、設 confidence=high、source=poedb|google、補 zhBase。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const P = 'data/name-map/';
const items = JSON.parse(readFileSync(P + 'items.json', 'utf8'));
const dict = JSON.parse(readFileSync(P + 'poedb-dict.json', 'utf8'));
const zhset = new Set(JSON.parse(readFileSync(P + '.work/zhset.json', 'utf8')));

// POEDB en→zh
const pdEn = new Map();
for (const b of dict.bases) pdEn.set(b.en, { zh: b.zh });
for (const u of dict.uniques) pdEn.set(u.en, { zh: u.zh, zhBase: u.zhBase });

// Google 驗證結果 en→zh（僅 verified）
const gEn = new Map();
for (const f of ['.work/verified_batch1.json', '.work/verified_missing.json']) {
  if (!existsSync(P + f)) continue;
  const j = JSON.parse(readFileSync(P + f, 'utf8'));
  for (const r of j.results || []) if (r.status === 'verified' && r.zh) gEn.set(r.en, r.zh);
}

let fromPoedb = 0, fromGoogle = 0;
for (const c of items.categories) {
  for (const p of c.pairs) {
    if (p.confidence === 'high' && p.source !== 'positional') continue;
    const pd = pdEn.get(p.en);
    if (pd) { p.zh = pd.zh; if (pd.zhBase) p.zhBase = pd.zhBase; p.confidence = 'high'; p.source = 'poedb'; delete p.discMismatch; fromPoedb++; continue; }
    const g = gEn.get(p.en);
    if (g) { p.zh = g; p.confidence = 'high'; p.source = 'google'; delete p.discMismatch; fromGoogle++; }
  }
}
// 重算 meta
const all = items.categories.flatMap(c => c.pairs);
items.meta.highConfidencePairs = all.filter(p => p.confidence === 'high').length;
items.meta.poedbVerified = all.filter(p => p.source === 'poedb').length;
items.meta.googleVerified = all.filter(p => p.source === 'google').length;
writeFileSync(P + 'items.json', JSON.stringify(items, null, 2) + '\n', 'utf8');
console.log('套用 POEDB(en反查):', fromPoedb, '| Google:', fromGoogle);
console.log('high 合計:', items.meta.highConfidencePairs, '/ total', all.length);
