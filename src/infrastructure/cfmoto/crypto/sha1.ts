import { readWordsBE, toHexString, utf8Encode, wordsToBytes } from './bytes'

/**
 * 纯 TypeScript SHA-1（RFC 3174），返回小写十六进制。
 *
 * 仅用于春风接口签名（`Cfmoto-X-Sign` 的内层哈希），不作其他安全用途。
 */

export function sha1Bytes(input: readonly number[]): number[] {
  const message = [...input]
  const bitLength = message.length * 8
  message.push(0x80)
  while (message.length % 64 !== 56) message.push(0)
  const high = Math.floor(bitLength / 0x100000000) >>> 0
  const low = bitLength >>> 0
  message.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff)
  message.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Array<number>(80)

  for (let offset = 0; offset < message.length; offset += 64) {
    const block = readWordsBE(message.slice(offset, offset + 64))
    for (let i = 0; i < 16; i += 1) w[i] = block[i] ?? 0
    for (let i = 16; i < 80; i += 1) {
      const value = (w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0)
      w[i] = ((value << 1) | (value >>> 31)) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i += 1) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + (w[i] ?? 0)) >>> 0
      e = d
      d = c
      c = ((b << 30) | (b >>> 2)) >>> 0
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  return wordsToBytes([h0, h1, h2, h3, h4], true)
}

export function sha1(text: string): string {
  return toHexString(sha1Bytes(utf8Encode(text)))
}
