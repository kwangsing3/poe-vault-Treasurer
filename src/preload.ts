// Preload：把主進程的橋接 API 安全地暴露給 renderer（contextIsolation 下用 contextBridge）。
// 網路請求（leagues、之後的 stash）都走主進程，避開 renderer 的 CORS，也方便日後處理帳號 cookie。
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('poe', {
  getLeagues: () => ipcRenderer.invoke('poe:leagues'),
  getStash: (tabIndex?: number, league?: string) =>
    ipcRenderer.invoke('poe:stash', tabIndex, league),
  getItemPrice: (league: string, name: string, type: string, rarity?: string) =>
    ipcRenderer.invoke('poe:itemPrice', league, name, type, rarity),
  getCurrencyPrice: (league: string, want: string, have?: string) =>
    ipcRenderer.invoke('poe:currencyPrice', league, want, have),
  getCurrencyCodes: () => ipcRenderer.invoke('poe:currencyCodes'),
  setRateLimit: (perMinute: number) => ipcRenderer.invoke('poe:setRateLimit', perMinute),
});

// 中央價格指數後台（poe-coco-priceindex）橋接：查聚合最新價 + 詢價派工代行。
contextBridge.exposeInMainWorld('index', {
  query: (league: string, items: unknown[]) =>
    ipcRenderer.invoke('index:query', league, items),
  startDispatch: (reporterId: string, league: string) =>
    ipcRenderer.invoke('index:startDispatch', reporterId, league),
  stopDispatch: () => ipcRenderer.invoke('index:stopDispatch'),
});

// 帳號連結（OAuth）橋接。
contextBridge.exposeInMainWorld('auth', {
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  status: () => ipcRenderer.invoke('auth:status'),
});

// Debug 橋接：查詢是否為 debug 模式、訂閱官方 API 請求紀錄（mode=debug 時才有事件）。
contextBridge.exposeInMainWorld('debug', {
  enabled: () => ipcRenderer.invoke('debug:enabled'),
  onApiCall: (cb: (rec: unknown) => void) =>
    ipcRenderer.on('debug:api', (_e, rec: unknown) => cb(rec)),
});

// 自繪標題列的視窗控制橋接。
contextBridge.exposeInMainWorld('win', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximizeToggle: () => ipcRenderer.send('win:maximizeToggle'),
  close: () => ipcRenderer.send('win:close'),
  onMaximizeChange: (cb: (maximized: boolean) => void) =>
    ipcRenderer.on('win:maximized', (_e, maximized: boolean) => cb(maximized)),
});
