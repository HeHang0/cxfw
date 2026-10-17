import type { AuthSession, UserProfile } from '../domain/models'

/** 会话与用户资料的持久化。ticket 属于凭证，只在这里读写，不做任何日志输出。 */

export interface SessionStore {
  loadSession(): AuthSession | null
  saveSession(session: AuthSession): void
  clearSession(): void
  loadProfile(): UserProfile | null
  saveProfile(profile: UserProfile): void
  clearProfile(): void
}
