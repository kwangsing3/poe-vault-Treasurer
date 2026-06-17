// Preload：把主進程的橋接 API 安全地暴露給 renderer（contextIsolation 下用 contextBridge）。
// 網路請求（leagues、之後的 stash）都走主進程，避開 renderer 的 CORS，也方便日後處理帳號 cookie。
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('poe', {
  getLeagues: () => ipcRenderer.invoke('poe:leagues'),
  getStash: (tabIndex?: number) => ipcRenderer.invoke('poe:stash', tabIndex),
});
