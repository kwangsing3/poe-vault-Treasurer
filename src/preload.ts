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
});

// 帳號連結（OAuth）橋接。
contextBridge.exposeInMainWorld('auth', {
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  status: () => ipcRenderer.invoke('auth:status'),
});

// 自繪標題列的視窗控制橋接。
contextBridge.exposeInMainWorld('win', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximizeToggle: () => ipcRenderer.send('win:maximizeToggle'),
  close: () => ipcRenderer.send('win:close'),
  onMaximizeChange: (cb: (maximized: boolean) => void) =>
    ipcRenderer.on('win:maximized', (_e, maximized: boolean) => cb(maximized)),
});
