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
- `data.ts` — mock 資料（取自線框 renderVals）
- `store.ts` — 共用狀態（`subscribe` / `update`）
- `router.ts` — hash 路由 + 頂部導覽 + 重繪迴圈
- `views/` — `overview` / `detail` / `search` / `report` / `settings` 五頁，各匯出 `View`
  （`render(): string` + 選用 `mount(root)`）

線框原檔每頁有 A（高密度）/ B（低密度）兩版，目前只做了 A。

## PoE 參考資料（trade API static data）

官方台服 trade API 的靜態資料端點，作為通貨 / 裝備 / 詞綴的對照來源：

| 用途 | 端點 | 本地 mock |
|------|------|-----------|
| 通貨資料 | `https://pathofexile.tw/api/trade/data/static` | `mock/trade-data/static.json` |
| 裝備參考 | `https://pathofexile.tw/api/trade/data/items` | `mock/trade-data/items.json` |
| 詞綴參考 | `https://pathofexile.tw/api/trade/data/stats` | `mock/trade-data/stats.json` |

- `mock/trade-data/` 是上述端點的快照，供開發/測試離線使用（內容為大型 JSON，
  stats 約 1.7MB）。需要更新時重新抓取對應端點即可。
- 透過 [`http.mod.ts`](./src/utility/http.mod.ts) 取用線上資料時，記得套用速率限制。

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
