// 用真實 NeverSink filter 驗證解析器：冪等性 + 內容零丟失 + 未知關鍵字統計。
// 執行：esbuild 打包後 node，argv[2] = filter 檔路徑（見 README 註）。
import { readFileSync } from 'node:fs';
import { parseFilter, serializeFilter } from '../src/pages/app/filter';

const path = process.argv[2];
if (!path) { console.error('用法: node <bundle> <filter路徑>'); process.exit(2); }

const src = readFileSync(path, 'utf-8');
const p1 = parseFilter(src);
const out1 = serializeFilter(p1);
const p2 = parseFilter(out1);
const out2 = serializeFilter(p2);

const partial = p1.blocks.filter((b) => b.unknown?.length);
console.log('檔案：', path.split(/[\\/]/).pop());
console.log('原始行數：', src.split(/\r?\n/).length);
console.log('preamble 行：', p1.preamble.length);
console.log('解析區塊：', p1.blocks.length, '（Show/Hide/Minimal =',
  p1.blocks.filter((b) => b.action === 'Show').length, '/',
  p1.blocks.filter((b) => b.action === 'Hide').length, '/',
  p1.blocks.filter((b) => b.action === 'Minimal').length, '）');
console.log('帶 Continue 的區塊：', p1.blocks.filter((b) => b.cont).length);
console.log('含進階(unknown)行的區塊：', partial.length, `（佔 ${(partial.length / p1.blocks.length * 100).toFixed(0)}%）`);

console.log('\n— 冪等性 —');
console.log('區塊數 兩輪一致：', p1.blocks.length === p2.blocks.length);
console.log('serialize 兩輪相同：', out1 === out2);

// 內容零丟失：比對「非空、非註解」行的多重集合（正規化空白）。
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
const contentMultiset = (text: string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const raw of text.split(/\r?\n/)) {
    const t = norm(raw);
    if (!t || t.startsWith('#')) continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
};
const inSet = contentMultiset(src);
const outSet = contentMultiset(out1);
let missing = 0; const missEx: string[] = [];
for (const [line, n] of inSet) {
  const got = outSet.get(line) ?? 0;
  if (got < n) { missing += n - got; if (missEx.length < 12) missEx.push(`(${n}→${got}) ${line}`); }
}
let added = 0; const addEx: string[] = [];
for (const [line, n] of outSet) {
  const had = inSet.get(line) ?? 0;
  if (n > had) { added += n - had; if (addEx.length < 12) addEx.push(`(${had}→${n}) ${line}`); }
}
console.log('\n— 內容行零丟失 —');
console.log('原始內容行(去重前) 總數：', [...inSet.values()].reduce((a, b) => a + b, 0));
console.log('遺失行數：', missing, missing ? '✗' : '✓');
if (missEx.length) console.log('  遺失樣本：\n   ' + missEx.join('\n   '));
console.log('新增/變形行數：', added, added ? '⚠' : '✓');
if (addEx.length) console.log('  新增樣本：\n   ' + addEx.join('\n   '));

// 未知關鍵字統計（首 token）→ 看哪些條件/動作還沒結構化。
const hist = new Map<string, number>();
for (const b of p1.blocks) for (const u of b.unknown ?? []) {
  const k = u.split(/\s+/)[0] ?? '?';
  hist.set(k, (hist.get(k) ?? 0) + 1);
}
const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
console.log('\n— passthrough 關鍵字 Top（出現次數）—');
for (const [k, n] of sorted.slice(0, 25)) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log(`  （共 ${sorted.length} 種不同關鍵字進 passthrough）`);
