// 由 data/name-map/{items,currency}.json 萃取精簡的 en→zh 對照，供 renderer
// 把 .filter 規則裡的英文 BaseType 顯示成中文（顯示層用，不影響產出）。
// 執行：node scripts/build-base-zh.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(readFileSync(join(root, 'data/name-map/items.json'), 'utf-8'));
const currency = JSON.parse(readFileSync(join(root, 'data/name-map/currency.json'), 'utf-8'));

/** @type {Record<string,string>} */
const map = {};
let skipped = 0;
const put = (en, zh) => {
  if (!en || !zh) { skipped++; return; }
  if (!(en in map)) map[en] = zh; // 先到先得（items 高信心優先，currency 補充）
};

// items：各分類的 base / unique 配對
for (const cat of items.categories ?? []) {
  for (const p of cat.pairs ?? []) put(p.en, p.zh);
}
// currency：通貨 / 碎片名稱
for (const p of currency.pairs ?? []) put(p.en, p.zh);

const out = join(root, 'src/pages/app/base-zh.json');
writeFileSync(out, JSON.stringify(map) + '\n', 'utf-8');
console.log(`寫入 ${out}：${Object.keys(map).length} 筆 en→zh（略過 ${skipped} 筆缺值）`);
