import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import {
  fetchLeagues,
  getStashByTab,
  getItemPrice,
  getCurrencyPrice,
  currencyCodeByName,
  setOfficialRateCap,
  indexQuery,
  startDispatch,
  stopDispatch,
  type IndexQueryItem,
} from "./api";
import { login as authLogin, logout as authLogout, getStatus as authStatus } from "./api/oauth";
import { SetRequestObserver } from "./utility/http.mod";
import { logApiCall, resetApiLog, apiLogPath } from "./api/apiLog";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Debug 模式：環境變數 mode=debug 時，把每次官方 API 請求（method/url含params/body/狀態）
// 轉送給 renderer 顯示在畫面上的 debug 面板。非 debug 模式不註冊觀察者，零額外負擔。
const DEBUG = (process.env["mode"] ?? process.env["MODE"] ?? "").toLowerCase() === "debug";
ipcMain.handle("debug:enabled", () => DEBUG);
// Debug 模式另開 CDP 遠端除錯埠，方便自動化驗證 / 截圖（非 debug 不開）。
if (DEBUG) app.commandLine.appendSwitch("remote-debugging-port", "9223");

// 移除預設應用選單（File / Edit / View / Window）。視窗改用隱藏式標題列，
// 由 renderer 的頂部列（藏品庫 · THE RELIQUARY）兼任標題列。
Menu.setApplicationMenu(null);

// 公用聯盟清單：在主進程抓（Node fetch 無 CORS 限制），失敗回傳 null 讓 renderer 用後備清單。
// 實際請求收斂在 src/api（走 http.mod.ts，已套速率限制）。
ipcMain.handle("poe:leagues", () => fetchLeagues());

// 倉庫物品：目前回傳 mock（尚未串帳號），shape 同真實端點。實作收斂在 src/api/stash.ts。
// 帶 league：mock 模式下只有標準模式有資料，其他聯盟回空（模擬多聯盟切換）。
ipcMain.handle("poe:stash", (_event, tabIndex?: number, league?: string) =>
  getStashByTab(tabIndex ?? 0, league !== undefined ? { league } : {}),
);

// 物品估價（傳奇/裝備）：經 trade search（兩段式 + 速率佇列），去離群取中位數。
ipcMain.handle(
  "poe:itemPrice",
  (_event, league: string, name: string, type: string, rarity?: string) =>
    getItemPrice(league, name, type, rarity),
);

// 通貨估價：走 exchange 端點（獨立佇列），回傳 1 want 兌多少 have（預設混沌石）。
ipcMain.handle(
  "poe:currencyPrice",
  (_event, league: string, want: string, have?: string) =>
    getCurrencyPrice(league, want, have ?? "chaos"),
);

// 通貨名稱 → trade code 對照（renderer 解析倉庫通貨名以呼叫 currencyPrice）。
ipcMain.handle("poe:currencyCodes", () => currencyCodeByName());

// 官方查價的使用者額外速率上限（件/分鐘）：設定頁可調，<=0 取消。實作見 tradePrice.setOfficialRateCap。
ipcMain.handle("poe:setRateLimit", (_event, perMinute: number) => {
  setOfficialRateCap(perMinute);
});

// 指數伺服器（poe-coco-priceindex）：批次查聚合最新價（顯示優先用）。離線回 null。
ipcMain.handle("index:query", (_event, league: string, items: IndexQueryItem[]) =>
  indexQuery(league, items),
);
// 詢價派工代行：啟用貢獻 / 切聯盟時起迴圈（領工→官方查價→回報）；停用時停。
ipcMain.handle("index:startDispatch", (_event, reporterId: string, league: string) => {
  startDispatch(reporterId, league);
});
ipcMain.handle("index:stopDispatch", () => {
  stopDispatch();
});

// 帳號連結（OAuth public client + PKCE + loopback）。token 僅留在主進程，不回傳給 renderer。
ipcMain.handle("auth:login", () => authLogin());
ipcMain.handle("auth:logout", () => authLogout());
ipcMain.handle("auth:status", () => authStatus());

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    // 無原生邊框；視窗控制鈕由 renderer 自繪（min/max/close），透過 IPC 操作視窗。
    frame: false,
    backgroundColor: "#d9d7d2", // = --bg，避免載入時白閃
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Debug 模式：把 http.mod 觀察到的每次請求送到此視窗的 renderer，並把 trade 查價請求
  // 追加到 price-queue.log（含 x-rate-limit-* 標頭）供事後分析限速問題。
  if (DEBUG) {
    resetApiLog();
    console.log(`[debug] 詢價佇列請求記錄：${apiLogPath()}`);
    SetRequestObserver((rec) => {
      logApiCall(rec);
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send("debug:api", rec);
    });
  }

  // 自繪標題列的視窗控制（renderer 按鈕 → IPC）。
  ipcMain.on("win:minimize", () => mainWindow.minimize());
  ipcMain.on("win:maximizeToggle", () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(),
  );
  ipcMain.on("win:close", () => mainWindow.close());
  // 把最大化狀態變化通知 renderer，讓最大化鈕圖示在「最大化/還原」之間切換。
  const sendMaxState = () =>
    mainWindow.webContents.send("win:maximized", mainWindow.isMaximized());
  mainWindow.on("maximize", sendMaxState);
  mainWindow.on("unmaximize", sendMaxState);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // 移除選單後，保留 F12 切換 DevTools 供開發除錯。
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      mainWindow.webContents.toggleDevTools();
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
