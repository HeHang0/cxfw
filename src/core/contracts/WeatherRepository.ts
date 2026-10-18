import type { CurrentWeather } from '../domain/weather'

export interface WeatherCacheEntry {
  readonly fetchedAt: string
  readonly weather: CurrentWeather
}

export interface WeatherRepository {
  load(): WeatherCacheEntry | null
  save(entry: WeatherCacheEntry): void
  remove(): void
}
