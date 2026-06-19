// HTML 跳脫工具。view 層以 template string 拼 HTML 再塞 innerHTML，
// 任何「使用者輸入 / 伺服器資料」插值前都應經 esc()，避免破壞標籤或注入。
// escape & < > " ' 五個字元，同時適用元素內文與單/雙引號屬性值，故單一函式即可。

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 跳脫任意值供插入 HTML（含屬性值）；null/undefined → 空字串。 */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}
