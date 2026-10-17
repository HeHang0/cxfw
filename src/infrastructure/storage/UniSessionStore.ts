import type { KeyValueStore } from '@/core/contracts/KeyValueStore'
import type { SessionStore } from '@/core/contracts/SessionStore'
import type { AuthSession, UserProfile } from '@/core/domain/models'
import { ScopedKeyValueStore } from './UniKeyValueStore'
import { storageKeys } from './storageKeys'

/**
 * 会话与用户资料的本地存储。
 *
 * ticket 属于凭证：只在这里读写，绝不写入日志。
 */

export interface UniSessionStoreOptions {
  readonly store: KeyValueStore
}

export class UniSessionStore implements SessionStore {
  private readonly baseStore: KeyValueStore
  private store: KeyValueStore

  constructor(options: UniSessionStoreOptions) {
    this.baseStore = options.store
    this.store = options.store
  }

  setNamespace(prefix = ''): void {
    this.store = prefix === '' ? this.baseStore : new ScopedKeyValueStore(this.baseStore, prefix)
  }

  loadSession(): AuthSession | null {
    const session = this.store.get<AuthSession>(storageKeys.session)
    if (!session || typeof session.ticket !== 'string' || session.ticket === '') return null
    return session
  }

  saveSession(session: AuthSession): void {
    this.store.set(storageKeys.session, session)
  }

  clearSession(): void {
    this.store.remove(storageKeys.session)
  }

  loadProfile(): UserProfile | null {
    return this.store.get<UserProfile>(storageKeys.profile)
  }

  saveProfile(profile: UserProfile): void {
    this.store.set(storageKeys.profile, profile)
  }

  clearProfile(): void {
    this.store.remove(storageKeys.profile)
  }
}

/** 内存实现，供测试与无本地存储的环境使用。 */
export class MemorySessionStore implements SessionStore {
  private session: AuthSession | null = null
  private profile: UserProfile | null = null

  loadSession(): AuthSession | null {
    return this.session
  }

  saveSession(session: AuthSession): void {
    this.session = session
  }

  clearSession(): void {
    this.session = null
  }

  loadProfile(): UserProfile | null {
    return this.profile
  }

  saveProfile(profile: UserProfile): void {
    this.profile = profile
  }

  clearProfile(): void {
    this.profile = null
  }
}
