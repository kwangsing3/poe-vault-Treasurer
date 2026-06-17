// 官方 trade API 的請求佇列 / 速率限制器。
//
// 官方以回應標頭動態宣告限制（每個 policy 可有多個滑動窗口），例如 trade-search：
//   x-rate-limit-rules:  Ip
//   x-rate-limit-ip:     5:10:60,15:60:300,30:300:1800   ← hits:period秒:封鎖秒
//   x-rate-limit-ip-state: 1:10:0,1:60:0,1:300:0          ← 目前用量
// 踩線會被封鎖（最久 30 分鐘），所以這裡採「主動避免」策略：
//   1) 同一 policy 的請求序列化（一次一個）
//   2) 送出前檢查每個窗口的近期請求數，必要時等到最舊的請求離開窗口才送
//   3) 收到 429 時依 Retry-After 暫停整個佇列（退避）
//   4) 每次回應都用標頭更新窗口規則（以官方實際宣告為準）
import type { Result } from "../utility/http.mod";
import { Sleep } from "../utility/http.mod";

/** 單一滑動窗口規則。 */
interface Window {
  hits: number; // 窗口內最多請求數
  period: number; // 窗口長度（秒）
}

/** 解析 "5:10:60,15:60:300" → [{hits:5,period:10},...]（忽略第三段封鎖秒數，主動避免用不到）。 */
function parseWindows(header: string): Window[] {
  return header
    .split(",")
    .map((seg) => seg.split(":"))
    .filter((p) => p.length >= 2)
    .map(([hits, period]) => ({ hits: Number(hits), period: Number(period) }))
    .filter((w) => w.hits > 0 && w.period > 0);
}

/**
 * 單一 policy 的限制器。trade-search 與 trade-fetch 是不同 policy，各自一個實例。
 */
export class RateLimiter {
  private windows: Window[];
  private readonly log: number[] = []; // 過往請求的時間戳（ms，遞增）
  private pausedUntil = 0; // 429 退避：在此時間前不送出
  private tail: Promise<void> = Promise.resolve(); // 序列化用的鏈尾

  /** @param defaults 尚未收到標頭前的保守預設窗口。 */
  constructor(defaults: Window[]) {
    this.windows = defaults;
  }

  /** 透過佇列送出一個請求。call 應回傳 http.mod 的 Result（內含 headers/status）。 */
  run<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
    const result = this.tail.then(async () => {
      await this.waitForSlot();
      const res = await call();
      this.updateFromHeaders(res);
      return res;
    });
    // 不論成功失敗都讓鏈往前，避免單次錯誤卡死整個佇列。
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** 等到送出下一個請求不會違反任何窗口（且不在 429 退避中）。 */
  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();

      if (now < this.pausedUntil) {
        await Sleep(this.pausedUntil - now);
        continue;
      }

      // 修剪掉超出最長窗口的舊紀錄
      const maxPeriodMs = Math.max(...this.windows.map((w) => w.period)) * 1000;
      while (this.log.length > 0 && this.log[0]! <= now - maxPeriodMs) {
        this.log.shift();
      }

      // 取所有窗口中最久的等待時間
      let wait = 0;
      for (const w of this.windows) {
        const windowStart = now - w.period * 1000;
        const inWindow = this.log.filter((t) => t > windowStart);
        if (inWindow.length >= w.hits) {
          // 需等到第 (N-hits) 筆離開窗口，才能再塞 1 筆
          const mustExpire = inWindow[inWindow.length - w.hits]!;
          wait = Math.max(wait, mustExpire + w.period * 1000 - now + 50);
        }
      }

      if (wait <= 0) {
        this.log.push(now);
        return;
      }
      await Sleep(wait);
    }
  }

  /** 用回應標頭更新窗口規則，並在 429 時設定退避。 */
  private updateFromHeaders<T>(res: Result<T>): void {
    const h = res.headers;
    const rules = h["x-rate-limit-rules"];
    if (rules) {
      const merged: Window[] = [];
      for (const rule of rules.split(",")) {
        const header = h[`x-rate-limit-${rule.trim().toLowerCase()}`];
        if (header) merged.push(...parseWindows(header));
      }
      if (merged.length > 0) this.windows = merged;
    }

    if (res.status === 429) {
      const retryAfter = Number(h["retry-after"]);
      const waitSec = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : this.maxRestrictFromState(h);
      if (waitSec > 0) this.pausedUntil = Date.now() + waitSec * 1000;
    }
  }

  /** 從 x-rate-limit-*-state 取出最久的封鎖剩餘秒數（429 無 Retry-After 時的後備）。 */
  private maxRestrictFromState(h: Record<string, string>): number {
    const rules = h["x-rate-limit-rules"];
    if (!rules) return 0;
    let max = 0;
    for (const rule of rules.split(",")) {
      const state = h[`x-rate-limit-${rule.trim().toLowerCase()}-state`];
      if (!state) continue;
      for (const seg of state.split(",")) {
        const restrict = Number(seg.split(":")[2]);
        if (Number.isFinite(restrict)) max = Math.max(max, restrict);
      }
    }
    return max;
  }
}
