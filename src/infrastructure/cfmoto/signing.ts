import { createNonce } from './crypto/bytes'
import { md5 } from './crypto/md5'
import { sha1 } from './crypto/sha1'
import type { CfMotoConfig } from './config'

/**
 * 春风的请求签名。
 *
 * api.yaml 给出的定义：
 * - `Cfmoto-X-Param`: `appId=..&nonce=..&timestamp=..`（前置脚本生成）
 * - `Cfmoto-X-Sign`: `md5hex(sha1hex(payload + Cfmoto-X-Param + APP_SECRET))`
 * - `signature`: 与 `Cfmoto-X-Sign` 同值
 *
 * 规则来自 `apifox-prerequest.js`，并用真实 ticket 验证：
 * - GET/DELETE 的 `payload` 是按 URL 顺序拼接的查询串原文；
 * - POST/PUT 的 `payload` 是原样发送的 JSON 文本；
 * - `nonce` 为 32 位十六进制随机串；
 * - `timestamp` 为 epoch 毫秒字符串。
 */

export interface SignParts {
  readonly payload: string
  readonly xParam: string
  readonly appSecret: string
}

export function buildXParam(appId: string, nonce: string, timestamp: string): string {
  return `appId=${appId}&nonce=${nonce}&timestamp=${timestamp}`
}

export function computeCfmotoSign(parts: SignParts): string {
  return md5(sha1(`${parts.payload}${parts.xParam}${parts.appSecret}`))
}

export interface BuildSignedHeadersInput {
  readonly config: CfMotoConfig
  /** GET/DELETE 传查询串原文；POST/PUT 传 JSON 请求体原文。 */
  readonly payload: string
  /** `ticket=..;vehicle_id=..;user_id=..`；登录前接口传 null。 */
  readonly cookie: string | null
  readonly nonce?: string
  readonly timestamp?: string
}

export interface SignedHeadersResult {
  readonly headers: Record<string, string>
  readonly xParam: string
  readonly nonce: string
  readonly timestamp: string
  readonly sign: string
}

export function buildSignedHeaders(input: BuildSignedHeadersInput): SignedHeadersResult {
  const nonce = input.nonce ?? createNonce()
  const timestamp = input.timestamp ?? String(Date.now())
  const xParam = buildXParam(input.config.appId, nonce, timestamp)
  const sign = computeCfmotoSign({ payload: input.payload, xParam, appSecret: input.config.appSecret })

  const headers: Record<string, string> = {
    /**
     * 注意：这里**不发送 User-Agent**。
     *
     * 浏览器内核（含小程序模拟器）把 User-Agent 列为禁止修改的头，
     * 设置它只会产生 `Refused to set unsafe header "User-Agent"` 并被丢弃；
     * 真机上 wx.request 同样无法覆盖 UA。
     * 实测官方接口在完全不带 UA 的情况下仍返回 code 0，
     * 因此改用与 UA 同值的 X-App-Info 携带 KLICEN_APP 标识。
     */
    'X-App-Info': input.config.userAgent,
    interfaceversion: input.config.interfaceVersion,
    'Cfmoto-X-Param': xParam,
    'Cfmoto-X-Sign': sign,
    signature: sign,
    'Cfmoto-X-Sign-Type': '0',
    appId: input.config.appId,
    nonce,
    timestamp,
  }
  if (input.cookie !== null && input.cookie !== '') {
    // #ifdef H5
    // 浏览器禁止手动设置 Cookie，由 Nginx 还原成上游 Cookie。
    headers['X-Cfmoto-Cookie'] = input.cookie
    // #endif
    // #ifndef H5
    headers['cookie'] = input.cookie
    // #endif
  }
  return { headers, xParam, nonce, timestamp, sign }
}

/** 未配置密钥时不要发出必然失败的请求。 */
export function hasAppSecret(config: CfMotoConfig): boolean {
  return config.appSecret.trim().length > 0
}
