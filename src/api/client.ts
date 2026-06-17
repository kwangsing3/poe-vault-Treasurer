// API 層的共用設定：速率限制與共用標頭。
// 任何 api/ 底下的呼叫函式都從這裡取得共用值，順帶在模組載入時套用一次全域速率限制。
import { SetRatePerMin } from "../utility/http.mod";

// GGG 官方對 trade API 有速率限制（實際上限以回應的 X-Rate-Limit 標頭為準）。
// 先以保守的全域上限避免觸發封鎖；日後可改成讀標頭動態調整。匯入本模組即生效（單一設定點）。
SetRatePerMin(30);

/** 套用在所有官方請求上的共用標頭（GGG 要求帶可辨識的 user-agent）。 */
export const POE_HEADERS: Record<string, string> = {
  "user-agent": "poe-vault-treasurer",
};
