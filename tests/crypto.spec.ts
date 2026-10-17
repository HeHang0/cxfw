import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { md5 } from '@/infrastructure/cfmoto/crypto/md5'
import { sha1 } from '@/infrastructure/cfmoto/crypto/sha1'

/**
 * 自带实现的哈希必须与标准一致，否则签名 `md5hex(sha1hex(...))` 必然错误，
 * 而接口只会返回含糊的失败信息，很难定位。
 * 这里同时对照 RFC 测试向量与 Node 的 crypto 实现（含多分块与中文）。
 */

const SAMPLES = [
  '',
  'a',
  'abc',
  'message digest',
  'abcdefghijklmnopqrstuvwxyz',
  '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
  'a'.repeat(55),
  'a'.repeat(56),
  'a'.repeat(57),
  'a'.repeat(64),
  'a'.repeat(1000),
  '春风摩托 CFMoto 250SR',
  'payload={"phone":"13900000000"}&appId=gxNLnk9s',
]

function nodeHash(algorithm: 'md5' | 'sha1', text: string): string {
  return createHash(algorithm).update(text, 'utf8').digest('hex')
}

describe('MD5', () => {
  it('匹配 RFC 1321 测试向量', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b')
    expect(md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890')).toBe(
      '57edf4a22be3c955ac49da2e2107b67a',
    )
  })

  it('与 Node crypto 在分块边界与 UTF-8 输入上完全一致', () => {
    for (const sample of SAMPLES) {
      expect(md5(sample), `md5(${sample.slice(0, 12)}…)`).toBe(nodeHash('md5', sample))
    }
  })
})

describe('SHA-1', () => {
  it('匹配 RFC 3174 测试向量', () => {
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(sha1('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    )
  })

  it('与 Node crypto 在分块边界与 UTF-8 输入上完全一致', () => {
    for (const sample of SAMPLES) {
      expect(sha1(sample), `sha1(${sample.slice(0, 12)}…)`).toBe(nodeHash('sha1', sample))
    }
  })
})
