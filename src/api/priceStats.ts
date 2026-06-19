// 估價用的純統計工具（無 electron / 網路相依，方便單元測試）。
// 由 tradePrice.ts 取用；對應測試見 scripts/test-price-stats.mts。

/** 數列中位數（偶數筆取中間兩數平均）。 */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * 從一批同幣別的買斷價推「代表價」：先依「價格層」分群（相鄰掛單差距 >2× 視為不同層），
 * 取人數最多的群之中位數；同票取較便宜的群（孤立的便宜/昂貴單視為 typo/釣魚，市場中心在最密集那層）。
 *
 * 取代舊版「以中位數為錨、保留 0.5x–2x」的做法：後者在雙峰且偶數筆時，中位數會落在兩峰空隙，
 * 修剪窗錨點被污染而剔除便宜群、保留貴群（如 [1,1,10,10] 會誤得 10）。改以分群消除此偏差。
 * 在單峰 / 連續分布等常見情形，結果與舊版一致。
 */
export function robustMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);

  // 相鄰掛單差距 >2× → 切成新的價格層。
  const clusters: number[][] = [[s[0]!]];
  for (let i = 1; i < s.length; i++) {
    if (s[i]! > s[i - 1]! * 2) clusters.push([s[i]!]);
    else clusters[clusters.length - 1]!.push(s[i]!);
  }

  // 取最多人掛的價格層；clusters 依價格由低到高，故平手時保留較便宜者（不覆蓋）。
  let best = clusters[0]!;
  for (const c of clusters) if (c.length > best.length) best = c;
  return median(best);
}
