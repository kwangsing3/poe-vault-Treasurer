// 跨進程共用的估價型別（單一事實來源）。
// main 進程的 trade 估價（src/api/tradePrice.ts）產出此 shape；renderer（src/pages/app/prices.ts）
// 經 IPC 取回後原樣快取。兩端只做 type-only import，打包時被抹除、無執行期耦合。
// 注意：preload 橋接的 ambient 宣告（forge.env.d.ts 的 PoePriceQuote）需與此結構保持一致。

/** 單筆掛單（原始幣別）。供詳情頁列表顯示。 */
export interface PriceListing {
  amount: number;
  currency: string;
}

/**
 * 估價結果。同一次請求的掛單同時含混沌石與神聖石單，故兩種價各別取中位數（無對應掛單則為 null）；
 * 不做跨幣別換算（通貨兌換比之後再處理）。listings 為取樣掛單。
 */
export interface PriceQuote {
  chaos: number | null; // 混沌石掛單的去離群中位數
  divine: number | null; // 神聖石掛單的去離群中位數
  fetchedAt: number; // 拉取時間（ms）
  sampleSize: number; // 取樣掛單總數
  listings: PriceListing[]; // 取樣掛單（詳情頁列表）
}
