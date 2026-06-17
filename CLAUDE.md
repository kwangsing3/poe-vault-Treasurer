# CLAUDE.md

給 AI 助手 / 開發者的專案指引。使用者面向的說明請見 [README.md](./README.md)。

## 專案定位

**PoE Vault Treasurer** 是一個 Path of Exile 的桌面財務管家：連結玩家的 PoE 帳號、
讀取 stash tabs、對物品估價，並追蹤總財富隨時間的變化。技術上是 **Electron +
TypeScript + Vite**（由 Electron Forge 驅動建置與發佈）。

**目前處於早期階段**：專案骨架、建置/發佈流程、底層 HTTP 工具已完成；UI 已依 Claude
Design 線框實作成博物館風格的 SPA（5 個頁面，先做高密度 A 變體），但資料仍是 mock、
PoE API 串接尚未開始。規劃方向見 README 的 roadmap。

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
- `store.ts` — 共用狀態（`subscribe` / `update`，含 `lastSync`）
- `router.ts` — hash 路由 + 頂部導覽 + 重繪迴圈；`switchLeague` / `syncLeague` 換聯盟並重載 vault +
  背景估價；頂部「總資產」走 `formatStashTotal`
- `views/` — `overview` / `detail` / `search` / `report` / `settings` 五頁，各匯出 `View`
  （`render(): string` + 選用 `mount(root)`）

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
