/**
 * Renderer 進入點。由 Vite 載入、執行於 renderer（瀏覽器）情境。
 *
 * 整個 UI 是單一視窗的 SPA：app shell（頂部導覽）+ 內容區，透過 hash 路由換頁。
 * 共用狀態放在 store，換頁時不重載頁面，因此使用者資料不會中斷。
 */

import './app/theme.css';
import { start } from './app/router';

const root = document.getElementById('app');
if (root) start(root);
