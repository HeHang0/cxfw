import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.argv[2] ?? 'dist/build/h5/index.html')
const marker = 'data-cfmoto-preview-ticket'
const storageKey = 'cfmoto:v1:session'

const previewSession = {
  ticket: 'test',
  userId: 'demo-user',
  nickname: '演示骑士',
  isVip: false,
  loginAt: '2026-01-01T00:00:00.000Z',
}

const injection = `    <script ${marker}>
      (function () {
        try {
          localStorage.setItem(
            ${JSON.stringify(storageKey)},
            JSON.stringify({ type: 'object', data: ${JSON.stringify(previewSession)} })
          );
        } catch (error) {
          console.warn('无法写入预览 ticket', error);
        }
      })();
    </script>
`

let html = await readFile(file, 'utf8')
if (!html.includes(marker)) {
  const moduleScript = /^[ \t]*<script\b[^>]*\btype=["']module["'][^>]*>/im
  const moduleMatch = moduleScript.exec(html)
  if (moduleMatch?.index !== undefined) {
    html = `${html.slice(0, moduleMatch.index)}${injection}${html.slice(moduleMatch.index)}`
  } else {
    html = html.replace(/<\/head>/i, `${injection}  </head>`)
  }
  await writeFile(file, html, 'utf8')
  console.log(`预览 ticket 已注入：${file}`)
} else {
  console.log(`预览 ticket 已存在，跳过：${file}`)
}
