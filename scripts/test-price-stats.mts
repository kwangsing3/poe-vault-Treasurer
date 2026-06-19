// 驗證估價代表價邏輯（src/api/priceStats.ts）。
// 重點：雙峰且偶數筆樣本不可被高估（舊版以中位數為錨會誤剔便宜群）。
// 執行：node scripts/test-price-stats.mts（Node 22.6+ 原生剝型別；本檔以顯式 .ts 副檔名 import 純模組）。
import { robustMedian } from '../src/api/priceStats.ts';

let fail = 0;
function eq(label: string, got: number | null, want: number | null): void {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}: got=${got} 預期=${want}`);
}

// 常見情形（應與舊版一致，確保無回歸）
eq('空陣列 → null', robustMedian([]), null);
eq('單筆', robustMedian([999]), 999);
eq('單峰 + 一個釣魚高價', robustMedian([5, 5, 6, 5, 5, 200]), 5);
eq('本次弓 divine 實測 [1,1,1,10]', robustMedian([1, 1, 1, 10]), 1);
eq('雙峰多便宜 [1,1,1,100,100]', robustMedian([1, 1, 1, 100, 100]), 1);
eq('便宜端單一 typo（保留多數貴群）', robustMedian([1, 50, 50, 50]), 50);
eq('平滑連續分布 [1,1.8,3.2,5.5]（單一群，中間兩數平均）', robustMedian([1, 1.8, 3.2, 5.5]), 2.5);

// 修正的 bug：雙峰 + 偶數筆，不可高估
eq('★ 雙峰偶數 [1,1,10,10]（舊版誤得 10）', robustMedian([1, 1, 10, 10]), 1);
eq('★ 兩筆對半 [1,100]（舊版誤得 100）', robustMedian([1, 100]), 1);

// 平手時取較便宜的價格層
eq('平手取便宜層 [2,2,9,9]', robustMedian([2, 2, 9, 9]), 2);

console.log(fail ? `\nFAILED: ${fail}` : '\nALL PASSED ✅');
if (fail) process.exit(1);
