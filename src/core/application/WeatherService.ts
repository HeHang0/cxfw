import type { Clock } from '../contracts/Clock'
import type { WeatherDataSource } from '../contracts/WeatherDataSource'
import type { WeatherCacheEntry, WeatherRepository } from '../contracts/WeatherRepository'
import {
  DEFAULT_WEATHER_COPY,
  selectWeatherCopy,
  type CurrentWeather,
  type WeatherCopyCategory,
} from '../domain/weather'
import { silentLogger, type Logger } from '../shared/logger'

export const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000

export interface WeatherView {
  readonly copy: string
  readonly category: WeatherCopyCategory
  readonly weather: CurrentWeather | null
  readonly fetchedAt: string | null
  readonly fromCache: boolean
}

export interface WeatherServiceDeps {
  readonly dataSource: WeatherDataSource
  readonly repository: WeatherRepository
  readonly clock: Clock
  readonly logger?: Logger
  readonly cacheTtlMs?: number
}

export class WeatherService {
  private readonly deps: WeatherServiceDeps
  private readonly logger: Logger
  private readonly ttlMs: number
  private failedAt: number | null = null

  constructor(deps: WeatherServiceDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
    this.ttlMs = deps.cacheTtlMs ?? WEATHER_CACHE_TTL_MS
  }

  async getGreeting(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ): Promise<WeatherView> {
    const coordinates = validCoordinates(latitude, longitude)
    if (!coordinates) return fallbackView()

    const now = this.deps.clock.now()
    if (this.failedAt !== null && now.getTime() - this.failedAt < this.ttlMs) {
      return fallbackView()
    }
    const cached = this.deps.repository.load()
    if (cached && this.isFresh(cached, now)) {
      const selected = this.selectCopy(cached.weather, now)
      return {
        copy: selected.copy,
        category: selected.category,
        weather: cached.weather,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
      }
    }
    if (cached) this.deps.repository.remove()

    try {
      const weather = await this.deps.dataSource.getCurrentWeather(
        coordinates.latitude,
        coordinates.longitude,
      )
      const fetchedAt = now.toISOString()
      const selected = this.selectCopy(weather, now)
      this.deps.repository.save({
        fetchedAt,
        weather,
      })
      this.failedAt = null
      return {
        copy: selected.copy,
        category: selected.category,
        weather,
        fetchedAt,
        fromCache: false,
      }
    } catch (error) {
      this.failedAt = now.getTime()
      this.logger.warn('天气获取失败，使用兜底文案', {
        reason: error instanceof Error ? error.message : String(error),
      })
      return fallbackView()
    }
  }

  private isFresh(entry: WeatherCacheEntry, now: Date): boolean {
    const fetchedAt = Date.parse(entry.fetchedAt)
    if (!Number.isFinite(fetchedAt)) return false
    const age = now.getTime() - fetchedAt
    return age >= 0 && age < this.ttlMs
  }

  private selectCopy(
    weather: CurrentWeather,
    now: Date,
  ): { readonly category: WeatherCopyCategory; readonly copy: string } {
    const locationSeed = weather.adcode ?? weather.district ?? weather.city ?? 'unknown'
    const timeBucket = Math.floor(now.getTime() / this.ttlMs)
    return selectWeatherCopy(weather, `${locationSeed}|${timeBucket}|${weather.updateTime ?? ''}`)
  }
}

function validCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): { latitude: number; longitude: number } | null {
  const valid =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  return valid ? { latitude, longitude } : null
}

function fallbackView(): WeatherView {
  return {
    copy: DEFAULT_WEATHER_COPY,
    category: 'fallback',
    weather: null,
    fetchedAt: null,
    fromCache: false,
  }
}
