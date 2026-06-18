import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import {
  fetchLeagues,
  getStashByTab,
  getItemPrice,
  getCurrencyPrice,
  currencyCodeByName,
} from "./api";
import { login as authLogin, logout as authLogout, getStatus as authStatus } from "./api/oauth";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

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
