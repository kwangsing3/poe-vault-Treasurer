// 驗證 HTML 跳脫工具（src/pages/app/html.ts）。
// 執行：node scripts/test-html-esc.mts（Node 22.6+ 原生剝型別；顯式 .ts import 純模組）。
import { esc } from '../src/pages/app/html.ts';

let fail = 0;
function eq(label: string, got: string, want: string): void {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}: got=${JSON.stringify(got)} 預期=${JSON.stringify(want)}`);
}

eq('script 注入', esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
eq('雙引號屬性逃逸', esc('" onmouseover="evil()'), '&quot; onmouseover=&quot;evil()');
eq('單引號', esc("a'b"), 'a&#39;b');
eq('& 不重複編碼問題（單次）', esc('Tom & Jerry'), 'Tom &amp; Jerry');
eq('一般中文物品名原樣', esc('索伏的愛撫'), '索伏的愛撫');
eq('null → 空字串', esc(null), '');
eq('undefined → 空字串', esc(undefined), '');
eq('數字', esc(42), '42');

console.log(fail ? `\nFAILED: ${fail}` : '\nALL PASSED ✅');
if (fail) process.exit(1);
