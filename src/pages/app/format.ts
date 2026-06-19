// renderer 共用的數值/時間格式化工具。
// 這些原本散在多個 view / 模組各自有一份相同實作（prices / report / settings），收斂於此避免漂移。

/** 數值精簡顯示：整數原樣、非整數取一位小數（如 12 / 12.4）。 */
export function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 把時間戳格式化成「剛剛 / N 分鐘前 / N 小時前 / N 天前」相對時間。 */
export function relativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return '剛剛';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}
