# CLAUDE.md

給 AI 助手 / 開發者的專案指引。使用者面向的說明請見 [README.md](./README.md)。

## 專案定位

**PoE Vault Treasurer** 是一個 Path of Exile 的桌面財務管家：連結玩家的 PoE 帳號、
讀取 stash tabs、對物品估價，並追蹤總財富隨時間的變化。技術上是 **Electron +
TypeScript + Vite**（由 Electron Forge 驅動建置與發佈）。

**目前處於早期階段**：專案骨架、建置/發佈流程、底層 HTTP 工具已完成；UI 已依 Claude
Design 線框實作成博物館風格的 SPA（5 個頁面，先做高密度 A 變體），但資料仍是 mock、
PoE API 串接尚未開始。規劃方向見 README 的 roadmap。

## 長期目標：中文化物品過濾器編輯器（對標 FilterBlade）

除了財務管家本身，本專案的長期目標是新增一個**對標 [FilterBlade.xyz](https://www.filterblade.xyz/?game=Poe1) 的繁中物品過濾器（loot filter）編輯器**，以**新頁籤**整合進這個 app、共用同套技術棧與物品/估價資料。核心能力：

- **用工具編輯/「編譯」物品過濾器**：在繁中 UI 設定規則（條件 + 動作），產出**可直接在台服遊戲內載入、相容 GGG 官方格式的合法 `.filter`**。
- **預覽結果**：在 app 內預覽規則套用後的外觀（顏色/邊框/字級/小地圖圖示等），並能對倉庫頁物品做顯示層套用（高亮/淡化）。

**關鍵前提（已查證，詳見 [`FILTER-EDITOR-ANALYSIS.md`](./FILTER-EDITOR-ANALYSIS.md)）：**
- 平台為 **PoE1 + 台服（Hotcool）客戶端**。**台服 filter 引擎英文與繁中 `BaseType`/`Class` 都接受**（2026-06 使用者實測更正先前誤判）→ 產出 `.filter` **可維持英文以求全相容**；中文化是「顯示/閱讀層」需求，非匹配需求。完整規則見 [`POE1-FILTER-RULES.md`](./POE1-FILTER-RULES.md)。
- 顯示層（中文）與產出層（filter 字串）須分離；規則內部以語言無關鍵儲存，序列化時可輸出英文（預設、全相容）或可選繁中。`data/name-map/` 提供英↔中對照供 UI 顯示。
- `NeverSink-Filter` 成品為 **MIT 可重用**；但其 precursor→編譯管線無授權/已下架，不重建。

**一步一步來**：財務管家的資料/同步先行；filter 編輯器**已起步**——「物品過濾器」頁籤已可
**讀取/匯入 `.filter`（含整份 NeverSink，無損 round-trip）、分節折疊瀏覽、搜尋、繁中 base 顯示、即時預覽、匯出**。
進階條件目前以唯讀 passthrough 保留（尚未全可編輯）；倉庫頁套用、台服資料夾直讀為後續。完整 DSL 規格、
資料來源、架構選項、MVP 範圍與待決問題見 `FILTER-EDITOR-ANALYSIS.md`。

## 架構

- **main 進程**（`src/main.ts`）：建立 `BrowserWindow`、載入 renderer。開發時載入
  Vite dev server URL，正式版以 `loadFile` 載入打包後的 renderer。
- **preload**（`src/preload.ts`）：目前為空，未來放置 contextBridge 暴露的安全 API。
- **renderer**（`src/pages/`）：Vite 的 root 指向 `src/pages`，進入點為 `index.html` →
  `renderer.ts`。瀏覽器情境，預設關閉 Node integration。
- 三個 Vite 設定檔（`vite.main/preload/renderer.config.ts`）由
  `@electron-forge/plugin-vite` 統合，產出至 `.vite/build`（main/preload）與
  `.vite/renderer/main_window`（renderer）。

### renderer SPA（`src/pages/app/`）

單一視窗的 SPA：app shell（頂部導覽 + 總資產）+ 內容區，用 **hash 路由**換頁、共用
**in-memory store**，所以換頁不重載、跨頁狀態不中斷。所有顯示文字一律用**繁體中文**。

- `theme.css` — 設計系統（色票 / 字體 / 卡片 / 各頁樣式）
- `data.ts` — 線框雜項 mock（稀有度色票 / 詞綴 / 比價列 等）
- `stash.ts` — 倉庫資料與**以聯盟為 key 的 vault**。`STASH_TABS`(36 頁固定中繼) +
  `STASH_ITEMS`（**當前聯盟**的物品，live binding）。`loadLeagueVault(league)` 啟動 / 切聯盟時
  透過 `window.poe.getStash(tabIndex, league)` 逐頁載入並快取；`isGridTab()` 區分 2D 網格分頁
  （Quad/Normal/Premium）與特殊分頁（通貨/碎片…改 flow 排列）。資料源為 `mock/stash/get-stash-items-tab{0..35}.json`
  （真實回應；僅 `value` 為 mock）。**在做真正帳號連結前一律以這份 mock 為資料源。**
- `prices.ts` — 傳奇估價（背景）：經 `window.poe.getItemPrice` 走 trade search，**去離群取中位數**，
  同一次請求同時得混沌石 + 神聖石價。單一 worker 的**查價佇列**（支援插隊到最前）；價格依聯盟
  存進 `localStorage`、超過 1 小時視為過期重查。
- `networth.ts` — 淨資產估值與走勢。`valuation()` **只計已估價真實資產**（目前=傳奇），每件只歸到
  「主流幣別」分別累加成混沌石/神聖石總額（不換算、不重複計），並產出分類小計。每小時對當前聯盟
  快照存 `localStorage`，最多保留 30 天、逾期丟棄（供報表走勢圖）。
- `store.ts` — 共用狀態（`subscribe` / `update`，含 `lastSync`）
- `filter.ts` — 物品過濾器的**語言無關資料模型 + `.filter` 解析/序列化**。`FilterBlock`（含
  `comments`/`headerComment`/`unknown`/`cont` 等無損欄位）；`parseFilter()` 把任意 `.filter`（含整份
  NeverSink）切成結構化區塊，**認得的條件/動作進可編輯欄位、不認得的整行原樣存 `unknown[]`**，序列化時
  原樣吐回（無損 round-trip，見 `scripts/test-filter-roundtrip.mts` / `inspect-neversink.mts`）。
- `base-zh.json` — 英文 base/通貨 → 繁中對照（顯示層用），由 `scripts/build-base-zh.mjs` 從 `data/name-map/`
  萃取；filter 頁把規則的英文 `BaseType` 顯示成中文。
- `filterApply.ts` + `base-meta.json` — **倉庫頁套用過濾器**的評估引擎。`matchItem(item, blocks)` 由上而下
  first-match-wins（支援 `Continue` 疊樣式），同時比對結構化條件與 `unknown[]` 進階條件；不支援的條件保守
  跳過該區塊。`base-meta.json`（`scripts/build-base-meta.mjs` 從 poedb-dict + currency 萃取）提供繁中 base →
  `{en, class}`，解決 BaseType 語言與 `Class` 兩個缺口（對倉庫物品約 90% class 命中）。
- `router.ts` — hash 路由 + 頂部導覽 + 重繪迴圈；`switchLeague` / `syncLeague` 換聯盟並重載 vault +
  背景估價；頂部「總資產」走 `formatStashTotal`。左上角**深色/淺色切換鈕**（`data-theme` 屬性 + localStorage
  持久化，色票以 CSS 變數覆寫）。
- `views/` — `overview` / `search` / `report` / `filter` / `settings` 五頁，各匯出 `View`
  （`render(): string` + 選用 `mount(root)`）。
  - `overview` 右側「銘牌」即**物品詳情面板**（已併入；點網格物品就地顯示詞綴 + 市場掛單 + 重新查價，
    不再有獨立詳情頁籤）；傳奇掛單以「同一標價聚合、標出筆數」呈現。搜尋列旁有**「套用過濾器」checkbox**
    （`store.filterApplied`）：勾選時用 `filterApply.matchItem` 對倉庫物品做顯示層覆蓋（Show 上色/邊框、Hide 淡化），
    銘牌名稱亦以命中規則的「掉落標籤」樣式呈現。純 app 內預覽、與遊戲無關。
  - `filter` 為物品過濾器頁：讀取/匯入 `.filter`、依 NeverSink `# [[NNNN]]` 標記分節折疊、搜尋、即時預覽、匯出；
    「原始碼 · .filter」面板**可直接編輯**，離開欄位即反解析回規則（雙向同步）。不預載示範規則。

慣例與重點：
- **倉庫頁尺寸**：依分頁類型，`QuadStash` 為 24×24，其餘 12×12（見 `tabSize()`）。
  總覽以真實 `x/y/w/h` 在深色格線上定位物品、顯示堆疊數，外觀比照遊戲內倉庫。
- **物品圖示**：stash 回應每件都帶真實 `icon`（CDN `webtw.poecdn.com`，離線會載不出）。
- **就地更新**：切頁籤 / 選物品 / 估價回填只刷新對應局部（grid / 銘牌），不走全域重繪，避免重置捲動。
- 全站「總資產 / 估值合計」一律以 `stash.ts` 的實際資料計算，跨頁一致。
- 線框原檔每頁有 A（高密度）/ B（低密度）兩版，目前只做了 A。

## PoE 參考資料（trade API static data）

官方台服 trade API 的靜態資料端點，作為通貨 / 裝備 / 詞綴的對照來源：

| 用途 | 端點 | 本地 mock |
|------|------|-----------|
| 通貨資料 | `https://pathofexile.tw/api/trade/data/static` | `mock/trade-data/static.json` |
| 裝備參考 | `https://pathofexile.tw/api/trade/data/items` | `mock/trade-data/items.json` |
| 詞綴參考 | `https://pathofexile.tw/api/trade/data/stats` | `mock/trade-data/stats.json` |
| 聯盟清單 | `https://pathofexile.tw/api/trade/data/leagues` | —（即時抓取，不留 mock） |

- `mock/trade-data/` 是上述靜態端點的快照，供開發/測試離線使用（內容為大型 JSON，
  stats 約 1.7MB）。需要更新時重新抓取對應端點即可。

#### 中英名稱對照表（`data/name-map/`）

為 filter 編輯器與「日後接國際服」準備的繁中↔英文對照層。英文側快照存
`mock/trade-data/en/{items,static,stats}.json`（來源 `https://www.pathofexile.com/api/trade/data/*`）。

**產生管線（兩步）：**
1. `scripts/harvest-poedb.mjs` — 從 POEDB（poedb.tw）每物品分類頁的 `/tw/` + `/us/` 兩語言版，以**語言無關 slug** inner-join 出權威 zh↔en 字典 → `data/name-map/poedb-dict.json`（base + unique + gem）。POEDB 兩語言版是同一份 GGPK，筆數/順序一致，故 slug-join 高信心。HTML 需先用 curl（瀏覽器 UA）抓到 `POEDB_HTML_DIR/{tw,us}/<Class>.html`。
2. `scripts/build-name-map.mjs` — 產出最終對照表 `data/name-map/{currency,stats,items}.json` + `REPORT.md`。

**對齊策略：**
- **currency / stats**：兩服 trade data 以逐筆語言無關 `id` join（高信心）。
- **items（裝備/寶石）**：trade 無逐筆 id，先以分類 `id` 分組、拆 base/unique 子序列位置對齊，**再用 `poedb-dict.json` 的 zh→en 覆寫**（命中即 `confidence:high`、`source:poedb`，並修正位置錯位）；未命中者退回位置對齊結果（`source:positional`，多為 `low`）。
- **已知陷阱**：items「整體筆數相同 ≠ 對齊正確」（base/unique 各差一筆會互相抵銷造成靜默錯位）。逐筆看 `confidence` 與 `source`，`source:poedb` 才是經第三方佐證的高信心。
- **已知缺口**：地圖（trade 保留大量已移除舊地圖，POEDB 當前頁不含）、物品化怪物（圖鑑）、聯盟石等屬 `low`，filter 多以 tier/class 規則處理，非逐基底名。currency 一律用 `currency.json`（items 內的 currency 分類為冗餘）。
- **聯盟清單是即時取得**（公用、無需登入）：`src/api/trade.ts` 的 `fetchLeagues()` 在主進程直接打
  上表端點，回傳 `{ id, realm, text }[]`，供 renderer 右上角聯盟切換。不做 mock。
- 透過 [`http.mod.ts`](./src/utility/http.mod.ts) 取用線上資料時，記得套用速率限制。

### 交易估價（trade search / exchange）

所有與官方 API 互動的入口都收斂在 `src/api/`（barrel 為 `index.ts`），於 **main 進程**執行、renderer 走 preload IPC：

- `tradePrice.ts` — `getItemPrice`（物品走 `/api/trade/search` 兩段式：search → fetch）與
  `getCurrencyPrice`（通貨走 `/api/trade/exchange`，**暫未從 UI 使用**）。實測這些端點**公開、免登入**即可查。
  「有效價格」= 線上 + 即刻購買（`sale_type=priced`）+ 限定稀有度 → 同批掛單裡混沌石 / 神聖石**各別去離群取中位數**。
- `rateLimiter.ts` — per-policy 的請求佇列：多窗口滑動、依回應 `x-rate-limit-*` 標頭自我校正、429 退避。
  search 與 exchange 各一個實例（policy 不同）。**串接官方 API 一律經此佇列**，勿直接打。
- `staticData.ts` — 由 `mock/trade-data/static.json` 建「通貨名稱 → trade code」對照（通貨估價用，之後接）。
- `client.ts` — 共用 `User-Agent`（`OAuth poecoco/<version> (contact: …)`）與全域速率限制設定。

## 常用指令

```bash
npm start          # 開發模式（HMR + Electron 視窗）
npm run package    # 打包成可執行檔資料夾
npm run make       # 產生安裝檔 + 可攜式 zip
npx tsc --noEmit   # 型別檢查（Vite 用 esbuild，不會自己跑 tsc）
```

建置細節與調整方式另見專案 skill：`.claude/skills/build/SKILL.md`。

## 重要慣例與注意事項（踩過的雷）

- **不要加 `"type": "module"` 到 package.json。** Forge 的 main 進程輸出是 CommonJS，
  加了會讓 Electron 載入時報 `require is not defined in ES module scope` 而崩潰。
  原始碼照常用 ESM `import`/`export`（Vite/esbuild 負責轉譯）。
- **renderer 的 `outDir` 必須是 `.vite/renderer/main_window`**（見
  `vite.renderer.config.ts`）。因為 `root` 被覆寫成絕對路徑 `src/pages`，若不固定
  `outDir`，Forge 會把 renderer 輸出到 `src/pages/.vite/...`，導致打包後找不到
  renderer → 正式版白畫面。
- **tsconfig 用 `module: ESNext` + `moduleResolution: Bundler`。** 這是 Vite 打包的
  專案、不是直接被 Node 執行的鬆散檔案；搭配 `verbatimModuleSyntax` 才允許 ESM 語法。
  勿改回 NodeNext。
- **tsconfig 開了 `exactOptionalPropertyTypes: true`** 等嚴格旗標。新增可選屬性時，
  若值可能為 `undefined`，型別要寫 `prop?: T | undefined`，或用條件式帶入物件
  （參考 `http.mod.ts` 的 `body` 寫法）。
- **HTTP 一律走 `src/utility/http.mod.ts`**，不要引入 axios。它是基於 `fetch` 的
  替代品，已內建統一 `Result` 型別與**速率限制**（`SetRatePerMin`）——串接 GGG API 時
  請透過它，以遵守官方 rate limit。
- `.vscode/` 被 gitignore（含 `launch.json`），VS Code 除錯設定為本機專用。

## 發佈

推 `v*` tag 會觸發 `.github/workflows/release.yml`：在 windows runner 上
`npm ci` + `npm run make`，並把安裝檔 / zip / nupkg 上傳成 GitHub Release。
平日 commit 採 Conventional Commits 風格。

## 程式碼風格

- 縮排與既有檔案一致；註解可中英夾雜（既有 `http.mod.ts` 用繁中註解）。
- 維持型別嚴格，不要為了過編譯而放寬 tsconfig。
