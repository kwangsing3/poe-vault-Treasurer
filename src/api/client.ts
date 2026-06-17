// API 層的共用設定：速率限制與共用標頭。
// 任何 api/ 底下的呼叫函式都從這裡取得共用值，順帶在模組載入時套用一次全域速率限制。
// 註：本模組僅於主進程使用（依賴 electron app 取版本號）。
import { app } from "electron";
import { SetRatePerMin } from "../utility/http.mod";

// GGG 官方對 trade API 有速率限制（實際上限以回應的 X-Rate-Limit 標頭為準）。
// 先以保守的全域上限避免觸發封鎖；日後可改成讀標頭動態調整。匯入本模組即生效（單一設定點）。
SetRatePerMin(30);

// 版本號取自 package.json（app.getVersion()）；不依賴 app.ready，可在載入時取得。
const VERSION = app.getVersion();

/**
 * 套用在所有官方請求上的共用標頭。
 * GGG 要求帶可辨識的 User-Agent，並建議附上聯絡方式（依官方 API 政策）。
 */
export const POE_HEADERS: Record<string, string> = {
  "user-agent": `OAuth poecoco/${VERSION} (contact: kwangsing3@gmail.com)`,
};
