// 由 mock/trade-data/static.json 萃取「通貨代碼 → { 繁中名, 圖示URL }」，供 renderer
// 把掛單幣別顯示成「數量 x [圖示] 中文幣名」。執行：node scripts/build-currency-meta.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stat = JSON.parse(readFileSync(join(root, 'mock/trade-data/static.json'), 'utf-8'));

// trade 的 /gen/image/ 渲染圖為全域 CDN（與語言無關），統一加上主機前綴。
const CDN = 'https://web.poecdn.com';

/** @type {Record<string,{zh:string,icon:string}>} */
const map = {};
for (const group of stat.result ?? []) {
  for (const e of group.entries ?? []) {
    if (!e.id || e.id in map) continue; // 先到先得
    if (!e.text || !e.image) continue;
    map[e.id] = { zh: e.text, icon: e.image.startsWith('http') ? e.image : CDN + e.image };
  }
}

const out = join(root, 'src/pages/app/currency-meta.json');
writeFileSync(out, JSON.stringify(map) + '\n', 'utf-8');
console.log(`寫入 ${out}：${Object.keys(map).length} 筆通貨 code→{zh,icon}`);
