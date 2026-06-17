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
