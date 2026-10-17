import { describe, expect, it } from 'vitest'
import { createLogger, maskPhone, redactContext, REDACTED, type LogRecord } from '@/core/shared/logger'

describe('日志脱敏', () => {
  it('手机号打码', () => {
    expect(maskPhone('13800138000')).toBe('138****8000')
    expect(maskPhone('123')).toBe('***')
  })

  it('凭证类字段整体隐藏', () => {
    const result = redactContext({
      ticket: 'TK-abcdef123456',
      password: 'p@ssw0rd',
      verifyCode: '123456',
      cookie: 'ticket=TK-1;user_id=1',
      appSecret: 'SECRET',
      signature: 'abc',
    })
    expect(result['ticket']).toBe(REDACTED)
    expect(result['password']).toBe(REDACTED)
    expect(result['verifyCode']).toBe(REDACTED)
    expect(result['cookie']).toBe(REDACTED)
    expect(result['appSecret']).toBe(REDACTED)
    expect(result['signature']).toBe(REDACTED)
  })

  it('嵌套对象与数组同样脱敏', () => {
    const result = redactContext({
      session: { ticket: 'TK-1', userId: '1' },
      list: [{ password: 'x' }],
    })
    expect(result['session']).toEqual({ ticket: REDACTED, userId: '1' })
    expect(result['list']).toEqual([{ password: REDACTED }])
  })

  it('写入 sink 的记录里不出现原始凭证', () => {
    const records: LogRecord[] = []
    const logger = createLogger({ scope: 'test', level: 'debug', sink: (record) => records.push(record) })
    logger.info('登录', { phone: '13800138000', ticket: 'TK-secret-value', nickname: 'n' })
    expect(records).toHaveLength(1)
    const serialized = JSON.stringify(records[0])
    expect(serialized).not.toContain('TK-secret-value')
    expect(serialized).not.toContain('13800138000')
    expect(serialized).toContain('138****8000')
  })

  it('按级别过滤', () => {
    const records: LogRecord[] = []
    const logger = createLogger({ level: 'warn', sink: (record) => records.push(record) })
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(records.map((record) => record.level)).toEqual(['warn', 'error'])
  })
})
