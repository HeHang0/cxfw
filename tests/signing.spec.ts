import { describe, expect, it } from 'vitest'
import { buildSignedHeaders, buildXParam, computeCfmotoSign } from '@/infrastructure/cfmoto/signing'
import { resolveCfMotoConfig } from '@/infrastructure/cfmoto/config'
import { md5 } from '@/infrastructure/cfmoto/crypto/md5'
import { sha1 } from '@/infrastructure/cfmoto/crypto/sha1'
import { TEST_REF, TEST_USER_ID } from './helpers/fixtures'

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase())
  return key === undefined ? undefined : headers[key]
}

describe('请求签名', () => {
  it('Cfmoto-X-Param 的格式与 api.yaml 描述一致', () => {
    expect(buildXParam('gxNLnk9s', 'abc123', '1700000000000')).toBe(
      'appId=gxNLnk9s&nonce=abc123&timestamp=1700000000000',
    )
  })

  it('sign = md5hex(sha1hex(payload + xParam + APP_SECRET))', () => {
    const payload = '{"phone":"13900000000"}'
    const xParam = 'appId=gxNLnk9s&nonce=abc123&timestamp=1700000000000'
    const appSecret = 'SECRET'
    expect(computeCfmotoSign({ payload, xParam, appSecret })).toBe(md5(sha1(`${payload}${xParam}${appSecret}`)))
  })

  it('生成 api.yaml 要求的全部请求头', () => {
    const config = resolveCfMotoConfig({ appSecret: 'SECRET' })
    const cookie = `ticket=TK-TEST;vehicle_id=${TEST_REF.deviceId};user_id=${TEST_USER_ID}`
    const result = buildSignedHeaders({
      config,
      payload: '',
      cookie,
      nonce: 'n1',
      timestamp: '1700000000000',
    })
    // User-Agent 属于浏览器/小程序禁止修改的头，改用 X-App-Info 携带同样的标识
    expect(result.headers['User-Agent']).toBeUndefined()
    expect(result.headers['X-App-Info']).toContain('KLICEN_APP|5.9.4')
    expect(result.headers['interfaceversion']).toBe('2')
    expect(result.headers['Cfmoto-X-Sign-Type']).toBe('0')
    expect(result.headers['appId']).toBe('gxNLnk9s')
    expect(result.headers['nonce']).toBe('n1')
    expect(result.headers['timestamp']).toBe('1700000000000')
    expect(result.headers['Cfmoto-X-Sign']).toBe(result.headers['signature'])
    expect(result.headers['Cfmoto-X-Sign']).toBe(result.sign)
    expect(headerValue(result.headers, 'cookie')).toBe(cookie)
  })

  it('登录前的请求不带 cookie 头', () => {
    const config = resolveCfMotoConfig({ appSecret: 'SECRET' })
    const result = buildSignedHeaders({ config, payload: '', cookie: null })
    expect(headerValue(result.headers, 'cookie')).toBeUndefined()
  })
})
