/**
 * UTF-8 编码工具。
 *
 * 小程序环境没有 Node 的 Buffer，也不保证有 TextEncoder，
 * 因此签名所需的字节序列在这里手工实现，避免依赖运行环境。
 */

export function utf8Encode(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  return bytes
}

export function toHexString(bytes: readonly number[]): string {
  let hex = ''
  for (const byte of bytes) {
    hex += (byte >>> 4).toString(16) + (byte & 0x0f).toString(16)
  }
  return hex
}

export function wordsToBytes(words: readonly number[], bigEndian: boolean): number[] {
  const bytes: number[] = []
  for (const word of words) {
    if (bigEndian) {
      bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff)
    } else {
      bytes.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff)
    }
  }
  return bytes
}

export function readWordsLE(bytes: readonly number[]): number[] {
  const words: number[] = []
  for (let i = 0; i < bytes.length; i += 4) {
    words.push((bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) | ((bytes[i + 2] ?? 0) << 16) | ((bytes[i + 3] ?? 0) << 24))
  }
  return words
}

export function readWordsBE(bytes: readonly number[]): number[] {
  const words: number[] = []
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0))
  }
  return words
}

/** 生成随机 nonce（32 位十六进制）。 */
export function createNonce(random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < 32; i += 1) {
    out += Math.floor(random() * 16).toString(16)
  }
  return out
}
