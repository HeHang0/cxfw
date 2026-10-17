/**
 * 春风开放接口配置。
 *
 * 全部取值来自工作区 `api.yaml`：
 * - `servers[0].url` → baseUrl
 * - 请求头样例中的 `appId=gxNLnk9s`、`User-Agent` 里的 `KLICEN_APP|5.9.4`、`interfaceversion=2`
 *
 * 唯一缺失的是签名密钥 `APP_SECRET`：api.yaml 只说明了算法
 * `md5hex(sha1hex(payload + Cfmoto-X-Param + APP_SECRET))`，没有给出密钥。
 * 因此这里默认留空，未配置时请求会以 CONFIG 错误快速失败（详见 docs/api-notes.md）。
 */

export interface CfMotoConfig {
  readonly baseUrl: string;
  readonly appId: string;
  /** 签名密钥。api.yaml 未提供，必须由使用方注入。 */
  readonly appSecret: string;
  readonly appVersion: string;
  readonly interfaceVersion: string;
  readonly userAgent: string;
  readonly timeoutMs: number;
  /** GET 请求失败时的重试次数。 */
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

export const CFMOTO_APP_SECRET_ENV = 'VITE_CFMOTO_APP_SECRET';

/** api.yaml 样例中的 User-Agent 模板；`KLICEN_APP|<版本>` 段必须保留，否则车辆接口整体 500。 */
export function buildUserAgent(appVersion: string): string {
  return `MOBILE|Android|14|KLICEN_APP|${appVersion}|Dalvik/2.1.0 (Linux; U; Android 14; Pixel 2 XL Build/UQ1A.240205.004)|1440*2804|80c5057ab8ed0000|1`;
}

export const DEFAULT_APP_VERSION = '5.9.4';
export const DEFAULT_INTERFACE_VERSION = '2';
export const DEFAULT_BASE_URL = 'https://c.cfmoto.com';
export const DEFAULT_APP_ID = 'gxNLnk9s';
export const DEFAULT_TIMEOUT_MS = 15000;

export type CfMotoConfigOverrides = Partial<Omit<CfMotoConfig, 'userAgent'>> & {
  readonly userAgent?: string;
};

export function resolveCfMotoConfig(
  overrides: CfMotoConfigOverrides = {}
): CfMotoConfig {
  const appVersion = overrides.appVersion ?? DEFAULT_APP_VERSION;
  return {
    baseUrl: normalizeBaseUrl(overrides.baseUrl ?? DEFAULT_BASE_URL),
    appId: overrides.appId ?? DEFAULT_APP_ID,
    appSecret: overrides.appSecret ?? '',
    appVersion,
    interfaceVersion: overrides.interfaceVersion ?? DEFAULT_INTERFACE_VERSION,
    userAgent: overrides.userAgent ?? buildUserAgent(appVersion),
    timeoutMs: overrides.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: overrides.maxRetries ?? 1,
    retryDelayMs: overrides.retryDelayMs ?? 300
  };
}

export function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export const MISSING_APP_SECRET_MESSAGE =
  '缺少春风接口签名密钥 APP_SECRET，无法生成合法的 Cfmoto-X-Sign';

export const MISSING_APP_SECRET_HINT =
  'api.yaml 只给出了签名算法 md5hex(sha1hex(payload + Cfmoto-X-Param + APP_SECRET))，未提供密钥。请在 .env.local 里配置 VITE_CFMOTO_APP_SECRET';
