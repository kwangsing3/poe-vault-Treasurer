// Round-trip 驗證：parse → serialize → parse 應冪等，且不丟失 unknown 行。
// 執行：npx esbuild 打包後以 node 跑（見檔尾說明）。
import { parseFilter, serializeFilter, type FilterBlock } from '../src/pages/app/filter';

const SAMPLE = `#===============================================================
# 測試用 filter（含進階條件 / alpha / Continue）
#===============================================================

#=== 頂級通貨 ===
Show
    Class "Currency"
    BaseType "Mirror of Kalandra" "Divine Orb"
    SetTextColor 255 255 255 255
    SetBackgroundColor 200 0 0 255
    SetFontSize 45
    PlayAlertSound 1 300
    MinimapIcon 0 White Diamond
    PlayEffect White

# 影響力裝備（未知條件，需 passthrough）
Show
    Rarity Rare
    HasInfluence Shaper Elder
    SocketGroup 5RGB
    PlayAlertSoundPositional 2 200
    SetBorderColor 255 200 0
    Continue

Minimal
    Class "Maps"
    MapTier >= 14

# 隱藏其餘普通/魔法
Hide
    Rarity <= Magic

Show
    Class "Gems"
    PlayAlertSound 5
`;

let fail = 0;
const assert = (cond: boolean, msg: string): void => {
  if (!cond) { console.error('  ✗', msg); fail++; }
  else console.log('  ✓', msg);
};

const p1 = parseFilter(SAMPLE);
const out1 = serializeFilter(p1);
const p2 = parseFilter(out1);
const out2 = serializeFilter(p2);

console.log('— 區塊數 —');
assert(p1.blocks.length === 5, `解析出 5 個區塊（實得 ${p1.blocks.length}）`);

console.log('— 冪等性 (serialize∘parse 穩定) —');
assert(out1 === out2, '第二輪序列化與第一輪相同（冪等）');
assert(p1.blocks.length === p2.blocks.length, '兩輪區塊數一致');

console.log('— 結構化解析正確 —');
const b0 = p1.blocks[0]!;
assert(b0.action === 'Show', 'b0 是 Show');
assert(b0.style.textColor?.length === 4 && b0.style.textColor![3] === 255, 'b0 文字色保留 alpha (4 元素)');
assert(b0.style.bgColor?.join(' ') === '200 0 0 255', 'b0 背景色 alpha 完整保留');
assert(b0.comments?.some((c) => c.includes('頂級通貨')) === true, 'b0 保留分節註解');
assert(b0.style.alertSound?.volume === 300, 'b0 音效音量 300');

const b1 = p1.blocks[1]!;
assert(b1.cont === true, 'b1 帶 Continue');
assert((b1.unknown ?? []).some((u) => u.startsWith('HasInfluence')), 'b1 未知條件 HasInfluence 進 unknown');
assert((b1.unknown ?? []).some((u) => u.startsWith('SocketGroup')), 'b1 未知條件 SocketGroup 進 unknown');
assert((b1.unknown ?? []).some((u) => u.startsWith('PlayAlertSoundPositional')), 'b1 未知動作 PlayAlertSoundPositional 進 unknown');
assert(b1.style.borderColor?.join(' ') === '255 200 0', 'b1 已知動作 SetBorderColor 仍解析');

const b2 = p1.blocks[2]!;
assert(b2.action === 'Minimal', 'b2 是 Minimal');

const b4 = p1.blocks[4]!;
assert(b4.style.alertSound?.id === 5 && b4.style.alertSound?.volume === undefined, 'b4 無音量音效 volume 為 undefined（不被補值）');

console.log('— passthrough 不丟失（出現在輸出文字）—');
for (const kw of ['HasInfluence Shaper Elder', 'SocketGroup 5RGB', 'PlayAlertSoundPositional 2 200']) {
  assert(out1.includes(kw), `輸出含原樣行：${kw}`);
}
assert(out1.includes('PlayAlertSound 5\n') || out1.includes('PlayAlertSound 5'), 'b4 音效不被補 volume');
assert(!/PlayAlertSound 5 \d/.test(out1), 'b4 PlayAlertSound 5 後面沒有被補上音量');

console.log('— 檔頭 preamble 保留 —');
assert(out1.includes('測試用 filter'), 'preamble 檔頭註解保留');

console.log('');
if (fail) { console.error(`FAILED: ${fail} 個斷言未過`); process.exit(1); }
console.log('ALL PASSED ✅');
console.log('\n— 序列化輸出預覽 —\n');
console.log(out1);
