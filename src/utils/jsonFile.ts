import { platform } from './platform'

interface FileSystemLike {
  writeFileSync(path: string, data: string, encoding: string): void
  readFileSync(path: string, encoding: string): string
}

interface FileApi {
  env?: { USER_DATA_PATH?: string }
  getFileSystemManager?(): FileSystemLike
  shareFileMessage?(options: {
    filePath: string
    fileName?: string
    success?: () => void
    fail?: (error: unknown) => void
  }): void
  chooseMessageFile?(options: {
    count: number
    type: 'file'
    extension?: string[]
    success?: (result: { tempFiles?: Array<{ path?: string; name?: string }> }) => void
    fail?: (error: unknown) => void
  }): void
  chooseFile?(options: {
    count: number
    type: 'all'
    extension?: string[]
    success?: (result: { tempFiles?: Array<{ path?: string; name?: string; file?: File }> }) => void
    fail?: (error: unknown) => void
  }): void
  setClipboardData?(options: {
    data: string
    success?: () => void
    fail?: (error: unknown) => void
  }): void
}

export type JsonExportResult = 'shared' | 'downloaded' | 'copied'

function resolveFileApi(): FileApi | null {
  const candidates: unknown[] = [
    (globalThis as { wx?: unknown }).wx,
    (globalThis as { uni?: unknown }).uni,
  ]
  try {
    candidates.push(platform())
  } catch {
    // 页面 API 不可用时只尝试原生文件 API 候选。
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const api = candidate as FileApi
    if (api.getFileSystemManager || api.chooseMessageFile || api.chooseFile) {
      return api
    }
  }
  return null
}

async function copyToClipboard(api: FileApi | null, text: string): Promise<boolean> {
  if (api?.setClipboardData) {
    return new Promise((resolve) => {
      api.setClipboardData?.({
        data: text,
        success: () => resolve(true),
        fail: () => resolve(false),
      })
    })
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
  return false
}

export async function exportJsonFile(fileName: string, payload: unknown): Promise<JsonExportResult> {
  const text = JSON.stringify(payload, null, 2)
  const api = resolveFileApi()
  const fs = api?.getFileSystemManager?.()
  const userDataPath = api?.env?.USER_DATA_PATH

  if (fs && userDataPath) {
    const filePath = `${userDataPath}/${fileName}`
    fs.writeFileSync(filePath, text, 'utf8')
    if (api?.shareFileMessage) {
      const shared = await new Promise<boolean>((resolve) => {
        api?.shareFileMessage?.({
          filePath,
          fileName,
          success: () => resolve(true),
          fail: () => resolve(false),
        })
      })
      if (shared) return 'shared'
    }
    if (await copyToClipboard(api, text)) return 'copied'
    throw new Error('文件已生成，但当前环境不支持分享文件或写入剪贴板')
  }

  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
    return 'downloaded'
  }

  if (await copyToClipboard(api, text)) return 'copied'
  throw new Error('当前环境不支持导出文件')
}

export async function readJsonFile(): Promise<unknown> {
  const api = resolveFileApi()
  if (!api) throw new Error('当前环境不支持导入文件')
  const fs = api.getFileSystemManager?.()

  if (api.chooseMessageFile && fs) {
    const path = await new Promise<string>((resolve, reject) => {
      api.chooseMessageFile?.({
        count: 1,
        type: 'file',
        extension: ['json'],
        success: (result) => {
          const filePath = result.tempFiles?.[0]?.path
          if (filePath) resolve(filePath)
          else reject(new Error('未选择 JSON 文件'))
        },
        fail: reject,
      })
    })
    return JSON.parse(fs.readFileSync(path, 'utf8')) as unknown
  }

  if (api.chooseFile) {
    const text = await new Promise<string>((resolve, reject) => {
      api.chooseFile?.({
        count: 1,
        type: 'all',
        extension: ['.json'],
        success: (result) => {
          const selected = result.tempFiles?.[0]
          if (selected?.file) {
            selected.file.text().then(resolve).catch(reject)
            return
          }
          if (selected?.path) {
            fetch(selected.path).then((response) => response.text()).then(resolve).catch(reject)
            return
          }
          reject(new Error('未选择 JSON 文件'))
        },
        fail: reject,
      })
    })
    return JSON.parse(text) as unknown
  }

  throw new Error('当前环境不支持导入文件')
}
