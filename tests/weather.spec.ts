import { describe, expect, it } from 'vitest'
import { WeatherService } from '@/core/application/WeatherService'
import type { Clock } from '@/core/contracts/Clock'
import type { HttpClient, HttpRequest, HttpResponse } from '@/core/contracts/HttpClient'
import type { WeatherDataSource } from '@/core/contracts/WeatherDataSource'
import {
  classifyWeather,
  DEFAULT_WEATHER_COPY,
  selectWeatherCopy,
  type CurrentWeather,
} from '@/core/domain/weather'
import { MemoryKeyValueStore } from '@/infrastructure/storage/MemoryKeyValueStore'
import { UniWeatherRepository } from '@/infrastructure/storage/UniWeatherRepository'
import { storageKeys } from '@/infrastructure/storage/storageKeys'
import { TencentWeatherDataSource } from '@/infrastructure/tencent/TencentWeatherDataSource'

function weather(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
  return {
    province: '江苏省',
    city: '苏州市',
    district: '吴江区',
    adcode: '320509',
    updateTime: '2026-10-18 12:40',
    condition: '多云',
    temperatureC: 24,
    windDirection: '西北风',
    windPower: '3-4级',
    windPowerV2: '3级',
    humidityPercent: 69,
    airPressureHpa: 1015,
    ...overrides,
  }
}

class WeatherSourceStub implements WeatherDataSource {
  readonly sourceId = 'weather-test'
  calls = 0

  async getCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather> {
    void latitude
    void longitude
    this.calls += 1
    return weather({ condition: '晴天', temperatureC: 26 })
  }
}

describe('天气文案', () => {
  it('按 weather 字段和安全优先规则分类', () => {
    expect(classifyWeather(weather({ condition: '晴天' }))).toBe('sunny')
    expect(classifyWeather(weather({ condition: '阴' }))).toBe('cloudy')
    expect(classifyWeather(weather({ condition: '小雨' }))).toBe('rain')
    expect(classifyWeather(weather({ condition: '雷阵雨伴有冰雹', temperatureC: 38 }))).toBe('thunder')
    expect(classifyWeather(weather({ condition: '特大暴雨' }))).toBe('heavy-rain')
    expect(classifyWeather(weather({ condition: '大雾' }))).toBe('fog')
    expect(classifyWeather(weather({ condition: '中雪' }))).toBe('snow')
    expect(classifyWeather(weather({ condition: '强沙尘暴' }))).toBe('dust')
    expect(classifyWeather(weather({ condition: '无' }))).toBe('fallback')
    expect(classifyWeather(weather({ condition: '多云', windPowerV2: '6级' }))).toBe('wind')
    expect(classifyWeather(weather({ condition: '多云', temperatureC: 3 }))).toBe('cold')
    expect(classifyWeather(weather({ condition: '晴天', temperatureC: 36 }))).toBe('hot')
  })

  it('同一稳定种子选择同一文案', () => {
    const first = selectWeatherCopy(weather({ condition: '晴天' }), 'location|bucket')
    const second = selectWeatherCopy(weather({ condition: '晴天' }), 'location|bucket')
    expect(first).toEqual(second)
  })

  it('天气结果缓存一小时，失败时回退通用文案', async () => {
    let now = new Date('2026-10-18T00:00:00.000Z')
    const clock: Clock = { now: () => new Date(now.getTime()) }
    const source = new WeatherSourceStub()
    const store = new MemoryKeyValueStore()
    const service = new WeatherService({
      dataSource: source,
      repository: new UniWeatherRepository({ store }),
      clock,
    })

    const first = await service.getGreeting(31.037666, 120.853333)
    // 坐标轻微变化不应产生新的缓存条目或重新请求天气。
    const second = await service.getGreeting(31.038, 120.854)
    expect(first.category).toBe('sunny')
    expect(second.fromCache).toBe(true)
    expect(second.copy).toBe(first.copy)
    expect(source.calls).toBe(1)

    const cached = store.get<Record<string, unknown>>(storageKeys.weather)
    expect(cached).toMatchObject({
      fetchedAt: expect.any(String),
      weather: expect.any(Object),
    })
    expect(cached).not.toHaveProperty('copy')
    expect(cached).not.toHaveProperty('locationKey')
    expect(store.keys(storageKeys.weatherLegacyPrefix)).toEqual([])

    now = new Date('2026-10-18T00:30:00.000Z')
    const withinTtl = await service.getGreeting(31.037666, 120.853333)
    expect(withinTtl.fromCache).toBe(true)
    expect(source.calls).toBe(1)

    now = new Date('2026-10-18T01:00:01.000Z')
    await service.getGreeting(31.037666, 120.853333)
    expect(source.calls).toBe(2)

    let failureCalls = 0
    const failed = new WeatherService({
      dataSource: {
        sourceId: 'failed',
        getCurrentWeather: async () => {
          failureCalls += 1
          throw new Error('network')
        },
      },
      repository: new UniWeatherRepository({ store: new MemoryKeyValueStore() }),
      clock,
    })
    const fallback = await failed.getGreeting(31.037666, 120.853333)
    await failed.getGreeting(31.037666, 120.853333)
    expect(fallback.category).toBe('fallback')
    expect(fallback.copy).toBe(DEFAULT_WEATHER_COPY)
    expect(failureCalls).toBe(1)
  })

  it('缓存只保存天气，文案按当前天气重新选择，并清理旧坐标键', async () => {
    const now = new Date('2026-10-18T00:00:00.000Z')
    const store = new MemoryKeyValueStore()
    store.set(storageKeys.weather, {
      fetchedAt: now.toISOString(),
      weather: weather({ condition: '小雨', temperatureC: 20 }),
      copy: '旧版本缓存的文案',
    })
    store.set(`${storageKeys.weatherLegacyPrefix}31.000,120.000`, {
      copy: '旧坐标缓存',
    })

    const source = new WeatherSourceStub()
    const service = new WeatherService({
      dataSource: source,
      repository: new UniWeatherRepository({ store }),
      clock: { now: () => new Date(now.getTime()) },
    })
    const result = await service.getGreeting(31.037666, 120.853333)

    expect(source.calls).toBe(0)
    expect(result.fromCache).toBe(true)
    expect(result.category).toBe('rain')
    expect(result.copy).not.toBe('旧版本缓存的文案')
    expect(store.keys(storageKeys.weatherLegacyPrefix)).toEqual([])
  })

  it('腾讯天气适配器按 api.yaml 传递参数并解析 realtime.infos', async () => {
    const calls: HttpRequest[] = []
    const http: HttpClient = {
      async request(request: HttpRequest): Promise<HttpResponse> {
        calls.push(request)
        return {
          statusCode: 200,
          headers: {},
          data: {
            status: 0,
            message: 'Success',
            result: {
              realtime: [
                {
                  province: '江苏省',
                  city: '苏州市',
                  district: '吴江区',
                  adcode: 320509,
                  update_time: '2026-10-18 12:40',
                  infos: {
                    weather: '阴',
                    temperature: 28,
                    wind_direction: '西北风',
                    wind_power: '3-4级',
                    wind_power_v2: '3级',
                    humidity: 69,
                    air_pressure: 1015,
                  },
                },
              ],
            },
          },
        }
      },
    }
    const source = new TencentWeatherDataSource({ http, apiKey: 'TEST_KEY' })
    const result = await source.getCurrentWeather(31.037666, 120.853333)

    expect(calls[0]?.url).toBe('https://apis.map.qq.com/ws/weather/v1/')
    expect(calls[0]?.query).toEqual({
      key: 'TEST_KEY',
      location: '31.037666,120.853333',
    })
    expect(result).toMatchObject({
      condition: '阴',
      temperatureC: 28,
      windPowerV2: '3级',
      humidityPercent: 69,
    })
  })
})
