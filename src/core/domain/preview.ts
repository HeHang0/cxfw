/** 本地预览账号。ticket 固定为 `test`，数据源据此切换到内置演示数据。 */

export const PREVIEW_LOGIN_NAME = 'test'
export const PREVIEW_PASSWORD = 'test'
export const PREVIEW_TICKET = 'test'

export function isPreviewCredentials(phone: string, password: string): boolean {
  return phone.trim() === PREVIEW_LOGIN_NAME && password === PREVIEW_PASSWORD
}

export function isPreviewTicket(ticket: string | null | undefined): boolean {
  return ticket === PREVIEW_TICKET
}
