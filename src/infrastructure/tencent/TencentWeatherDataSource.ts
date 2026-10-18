import type { HttpClient } from '@/core/contracts/HttpClient';
import type { WeatherDataSource } from '@/core/contracts/WeatherDataSource';
import { AppError } from '@/core/application/errors';
import type { CurrentWeather } from '@/core/domain/weather';

const TENCENT_MAP_BASE_URL = 'https://apis.map.qq.com';
const WEATHER_PATH = '/ws/weather/v1/';

export interface TencentWeatherDataSourceOptions {
  readonly http: HttpClient;
  readonly apiKey: string;
}

/** `api.yaml` 中 `/ws/weather/v1/` 的真实响应适配。 */
export class TencentWeatherDataSource implements WeatherDataSource {
  readonly sourceId = 'tencent-weather';
  private readonly http: HttpClient;
  private readonly apiKey: string;

  constructor(options: TencentWeatherDataSourceOptions) {
    this.http = options.http;
    this.apiKey = options.apiKey.trim();
  }

  async getCurrentWeather(
    latitude: number,
    longitude: number
  ): Promise<CurrentWeather> {
    if (!this.apiKey) {
      throw new AppError('缺少腾讯地图 API Key', {
        code: 'CONFIG',
        hint: '请在 .env.local 中配置 VITE_TENCENT_MAP_KEY'
      });
    }

    const response = await this.http.request({
      url: `${TENCENT_MAP_BASE_URL}${WEATHER_PATH}`,
      method: 'GET',
      query: {
        key: this.apiKey,
        location: `${latitude},${longitude}`
      },
      timeoutMs: 10_000
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new AppError(`天气接口返回 HTTP ${response.statusCode}`, {
        code: 'HTTP',
        retriable: response.statusCode >= 500
      });
    }

    const root = asRecord(response.data);
    const status = toNumber(root['status']);
    if (status !== 0) {
      throw new AppError(toText(root['message']) ?? '天气接口返回业务错误', {
        code: 'BUSINESS'
      });
    }
    const result = asRecord(root['result']);
    const realtime = Array.isArray(result['realtime'])
      ? result['realtime'][0]
      : null;
    const current = asRecord(realtime);
    const infos = asRecord(current['infos']);
    const condition = toText(infos['weather']);
    if (condition === null) {
      throw new AppError('天气响应缺少 weather 字段', { code: 'PARSE' });
    }

    return {
      province: toText(current['province']),
      city: toText(current['city']),
      district: toText(current['district']),
      adcode: toText(current['adcode']),
      updateTime: toText(current['update_time']),
      condition,
      temperatureC: toNumber(infos['temperature']),
      windDirection: toText(infos['wind_direction']),
      windPower: toText(infos['wind_power']),
      windPowerV2: toText(infos['wind_power_v2']),
      humidityPercent: toNumber(infos['humidity']),
      airPressureHpa: toNumber(infos['air_pressure'])
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
