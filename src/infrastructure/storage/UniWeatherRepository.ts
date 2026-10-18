import type { KeyValueStore } from '@/core/contracts/KeyValueStore'
import type { WeatherCacheEntry, WeatherRepository } from '@/core/contracts/WeatherRepository'
import { storageKeys } from './storageKeys'

export interface UniWeatherRepositoryOptions {
  readonly store: KeyValueStore
}

export class UniWeatherRepository implements WeatherRepository {
  private readonly store: KeyValueStore

  constructor(options: UniWeatherRepositoryOptions) {
    this.store = options.store
    this.removeLegacyEntries()
  }

  load(): WeatherCacheEntry | null {
    const entry = this.store.get<WeatherCacheEntry>(storageKeys.weather)
    if (!entry || typeof entry.weather?.condition !== 'string') return null
    return entry
  }

  save(entry: WeatherCacheEntry): void {
    this.store.set(storageKeys.weather, entry)
  }

  remove(): void {
    this.store.remove(storageKeys.weather)
  }

  private removeLegacyEntries(): void {
    for (const key of this.store.keys(storageKeys.weatherLegacyPrefix)) {
      this.store.remove(key)
    }
  }
}
