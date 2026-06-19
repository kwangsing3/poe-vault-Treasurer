const DEFAULT_TIMEOUT = 15000;

/**
 * 最終送出的請求設定（取代原本的 AxiosRequestConfig）。
 */
export interface RequestConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | undefined;
  timeout: number;
}

/**
 * 統一回覆格式。
 * 透過 `success` 作為判別欄位：
 * - `success: true` 時保證 `data` 有值、`error` 為 `null`
 * - `success: false` 時 `data` 為 `null`、`error` 為錯誤訊息字串
 */
export type Result<T> =
  | {
      success: true;
      data: T;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      config: RequestConfig;
      error: null;
    }
  | {
      success: false;
      data: null;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      config: RequestConfig;
      error: string;
    };

/**
 * 請求選項。所有欄位皆為可選。
 */
export interface RequestOptions {
  /** 自訂請求標頭 */
  headers?: Record<string, string>;
  /** query string 參數，會被序列化後接到 URL */
  params?: Record<string, unknown>;
  /** 逾時毫秒數，預設 15000 */
  timeout?: number;
  /**
   * 是否套用全域節流（SetRatePerMin）。預設 true。
   * 交給 per-policy RateLimiter 動態管控（依回應 x-rate-limit-* 自我校正）的請求應設 false，
   * 避免被靜態全域上限二次節流而拖慢。
   */
  throttle?: boolean;
}

/**
 * 底層請求函式，所有 HTTP method 皆共用此實作。基於原生 `fetch`。
 * @param method HTTP 方法
 * @param url 請求路徑
 * @param data 請求主體（GET/DELETE 通常為 undefined）
 * @param options 請求選項
 */
async function request<T>(
  method: string,
  url: string,
  data?: unknown,
  options: RequestOptions = {},
): Promise<Result<T>> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const finalUrl = appendParams(url, options.params);

  // 序列化請求主體：物件自動轉 JSON 並補上 Content-Type
  let body: string | undefined;
  if (data !== undefined && data !== null) {
    if (typeof data === "string") {
      body = data;
    } else {
      body = JSON.stringify(data);
      if (!hasHeader(headers, "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  const config: RequestConfig = {
    method: method.toUpperCase(),
    url: finalUrl,
    headers,
    body,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
  };

  if (options.throttle !== false) await throttle();

  const started = Date.now();
  let result: Result<T>;
  try {
    const response = await fetch(finalUrl, {
      method: config.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(config.timeout),
    });

    const respHeaders = Object.fromEntries(response.headers.entries());
    const parsed = await parseBody(response);

    if (!response.ok) {
      // fetch 不會對非 2xx 拋錯，需自行判斷
      const detail =
        parsed != null
          ? ` Body: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`
          : "";
      result = {
        success: false,
        data: null,
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
        config,
        error:
          `Server error - Status: ${response.status} ` +
          `(${response.statusText}). URL: ${finalUrl}.${detail}`,
      };
    } else {
      result = {
        success: true,
        data: parsed as T,
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
        config,
        error: null,
      };
    }
  } catch (error) {
    result = toErrorResult<T>(error, config);
  }

  notifyObserver(config, result, Date.now() - started);
  return result;
}

// ── 請求觀察者（debug 模式用）───────────────────────────────────────────────
// 由主進程選擇性註冊，把每次請求的 method/url(含 params)/body/狀態回報出去，
// 供 debug 面板顯示。預設無觀察者 → 零額外負擔；觀察者拋錯不影響請求本身。

/** 一次官方 API 請求的紀錄（供 debug 顯示 / 診斷記錄）。 */
export interface ApiCallRecord {
  t: number; // 完成時間戳（ms）
  method: string;
  url: string; // 最終 URL（已含 query params）
  body: string | null; // request body（通常為 JSON 字串）
  status: number; // HTTP 狀態（網路層失敗為 0）
  ok: boolean; // 是否成功（2xx）
  ms: number; // 耗時（不含速率限制等待）
  /** 回應的 x-rate-limit-* 與 retry-after 標頭（診斷限速用；無則省略）。 */
  rateLimit?: Record<string, string>;
  /** 非 2xx 時的錯誤訊息（含伺服器回應 body 摘要；成功時省略）。 */
  detail?: string;
}

let observer: ((rec: ApiCallRecord) => void) | null = null;

/** 註冊/清除請求觀察者（傳 null 取消）。 */
export function SetRequestObserver(fn: ((rec: ApiCallRecord) => void) | null): void {
  observer = fn;
}

function notifyObserver(config: RequestConfig, result: Result<unknown>, ms: number): void {
  if (!observer) return;
  try {
    const rateLimit: Record<string, string> = {};
    for (const [k, v] of Object.entries(result.headers)) {
      if (k.startsWith("x-rate-limit") || k === "retry-after") rateLimit[k] = v;
    }
    observer({
      t: Date.now(),
      method: config.method,
      url: config.url,
      body: config.body ?? null,
      status: result.status,
      ok: result.success,
      ms,
      ...(Object.keys(rateLimit).length > 0 ? { rateLimit } : {}),
      ...(result.success ? {} : { detail: result.error.slice(0, 400) }),
    });
  } catch {
    /* 觀察者錯誤不可影響請求流程 */
  }
}

/**
 * GET method
 * @param url 請求路徑
 * @param options 請求選項
 */
export function GET<T>(
  url: string,
  options?: RequestOptions,
): Promise<Result<T>> {
  return request<T>("GET", url, undefined, options);
}

/**
 * DELETE method
 * @param url 請求路徑
 * @param options 請求選項
 */
export function DELETE<T>(
  url: string,
  options?: RequestOptions,
): Promise<Result<T>> {
  return request<T>("DELETE", url, undefined, options);
}

/**
 * POST method
 * @param url 請求路徑
 * @param data 請求主體
 * @param options 請求選項
 */
export function POST<T>(
  url: string,
  data?: unknown,
  options?: RequestOptions,
): Promise<Result<T>> {
  return request<T>("POST", url, data, options);
}

/**
 * PUT method
 * @param url 請求路徑
 * @param data 請求主體
 * @param options 請求選項
 */
export function PUT<T>(
  url: string,
  data?: unknown,
  options?: RequestOptions,
): Promise<Result<T>> {
  return request<T>("PUT", url, data, options);
}

/**
 * PATCH method
 * @param url 請求路徑
 * @param data 請求主體
 * @param options 請求選項
 */
export function PATCH<T>(
  url: string,
  data?: unknown,
  options?: RequestOptions,
): Promise<Result<T>> {
  return request<T>("PATCH", url, data, options);
}

/**
 * 依照毫秒數阻塞當前流程。
 * @param ms 等待的毫秒數
 */
export function Sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let minIntervalMS = 0;
let lastRequestAt = 0;

/**
 * 設定每分鐘可接受的請求次數。設為 0 或負數則關閉速率限制。
 * @param requestsPerMinute 每分鐘的請求數
 */
export const SetRatePerMin = (requestsPerMinute: number): void => {
  minIntervalMS = requestsPerMinute > 0 ? 60000 / requestsPerMinute : 0;
};

/**
 * 取得距離下一次允許請求還需等待的毫秒數。
 * @returns 需要等待的毫秒數（0 表示可立即請求）
 */
export const GetRateLimit = (): number => {
  if (minIntervalMS <= 0) return 0;
  const wait = lastRequestAt + minIntervalMS - Date.now();
  return wait > 0 ? wait : 0;
};

/**
 * 依照速率限制等待，並更新最後請求時間。
 */
async function throttle(): Promise<void> {
  if (minIntervalMS <= 0) return;
  const wait = GetRateLimit();
  if (wait > 0) await Sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * 把 params 物件序列化成 query string 並接到 URL 後方。
 */
function appendParams(url: string, params?: Record<string, unknown>): string {
  if (!params) return url;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) qs.append(key, String(value));
  }
  const serialized = qs.toString();
  if (!serialized) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${serialized}`;
}

/**
 * 依 Content-Type 解析回應主體：JSON 走 `JSON.parse`，其餘回傳純文字。
 * 空回應回傳 `null`。
 */
async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * 大小寫不敏感地判斷標頭是否已存在。
 */
function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

/**
 * 將 fetch 拋出的例外轉換為統一的失敗 `Result`。
 * 不在函式內輸出 log，錯誤訊息一律放進 `error` 欄位，由呼叫端決定如何處理。
 */
function toErrorResult<T>(error: unknown, config: RequestConfig): Result<T> {
  let message: string;

  if (error instanceof DOMException && error.name === "TimeoutError") {
    message = `Request timeout after ${config.timeout}ms. URL: ${config.url}`;
  } else if (error instanceof DOMException && error.name === "AbortError") {
    message = `Request aborted. URL: ${config.url}`;
  } else if (error instanceof TypeError) {
    // fetch 在網路層失敗（DNS、連線中斷等）會丟 TypeError
    message = `Network error: ${error.message}. URL: ${config.url}`;
  } else {
    message = `Request error: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  return {
    success: false,
    data: null,
    status: 0,
    statusText: "Error",
    headers: {},
    config,
    error: message,
  };
}
