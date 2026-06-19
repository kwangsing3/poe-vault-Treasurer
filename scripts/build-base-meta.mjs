// 由 poedb-dict（bases + uniques）與 currency 產出「繁中 base → { en, cls }」對照，
// 供倉庫頁套用物品過濾器時比對 BaseType(語言)與 Class。
// POEDB 的 class slug（底線）轉空白即≈ filter 的 Class 名。
// 執行：node scripts/build-base-meta.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dict = JSON.parse(readFileSync(join(root, 'data/name-map/poedb-dict.json'), 'utf-8'));
const currency = JSON.parse(readFileSync(join(root, 'data/name-map/currency.json'), 'utf-8'));

const cls = (s) => (s ? String(s).replace(/_/g, ' ').trim() : '');

/** @type {Record<string,{en:string,cls:string}>} */
const map = {};
const put = (zh, en, c) => {
  if (!zh) return;
  if (!(zh in map)) map[zh] = { en: en || '', cls: c || '' };
};

// 1) 一般 base（權威：base→class）
for (const b of dict.bases ?? []) put(b.zh, b.en, cls(b.class));
// 2) 傳奇：以其 base（zhBase→enBase）補上未涵蓋的底名
for (const u of dict.uniques ?? []) put(u.zhBase, u.enBase, cls(u.class));
// 3) 通貨/碎片：class 一律 Currency（frameType 另會輔助粗分類）
for (const p of currency.pairs ?? []) put(p.zh, p.en, 'Currency');

const out = join(root, 'src/pages/app/base-meta.json');
writeFileSync(out, JSON.stringify(map) + '\n', 'utf-8');
const withCls = Object.values(map).filter((v) => v.cls).length;
console.log(`寫入 ${out}：${Object.keys(map).length} 筆 zh base→{en,cls}（含 class ${withCls} 筆）`);
