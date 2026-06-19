// 驗證倉庫頁過濾器評估引擎：用小型 filter 對代表性物品比對，看 action 是否符合預期。
import { parseFilter } from '../src/pages/app/filter';
import { matchItem } from '../src/pages/app/filterApply';

const F = `
Show
    Class "Currency"
    BaseType "Divine Orb" "Mirror of Kalandra"
    SetBorderColor 255 0 0
    SetBackgroundColor 120 0 0 255

Show
    LinkedSockets >= 6
    SetBorderColor 200 0 200

Show
    Rarity Unique
    HasInfluence Shaper
    SetBorderColor 175 96 37

Hide
    Rarity <= Magic
`;
const blocks = parseFilter(F).blocks;

const base = { tab: 0, value: 1, icon: '', x: 0, y: 0, w: 1, h: 1 };
const items = [
  { id: 'a', name: '神聖石', base: '神聖石', rarity: 'currency', frame: 5, stack: 3, ...base, w: 1, h: 1, name2: '通貨 神聖石' },
  { id: 'b', name: '六連胸甲', base: '革兜', rarity: 'rare', frame: 2, links: 6, w: 2, h: 3, ...base },
  { id: 'c', name: '影響傳奇', base: '革兜', rarity: 'unique', frame: 3, influences: ['Shaper'], w: 2, h: 3, ...base },
  { id: 'd', name: '無影傳奇', base: '革兜', rarity: 'unique', frame: 3, w: 2, h: 3, ...base },
  { id: 'e', name: '普通甲', base: '革兜', rarity: 'normal', frame: 0, w: 2, h: 3, ...base },
];

const expect = { a: 'Show', b: 'Show', c: 'Show', d: null, e: 'Hide' };
let fail = 0;
for (const it of items) {
  const m = matchItem(it as never, blocks);
  const got = m?.action ?? null;
  const ok = got === (expect as Record<string, string | null>)[it.id];
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${it.id} ${it.name} → ${got ?? '(無命中)'}${m?.style.borderColor ? ` border=${m.style.borderColor.join(',')}` : ''}  [預期 ${expect[it.id as keyof typeof expect] ?? '(無)'}]`);
}
console.log(fail ? `\nFAILED: ${fail}` : '\nALL PASSED ✅');
if (fail) process.exit(1);
