import type { CurrentWeather } from '../domain/weather'

export interface WeatherDataSource {
  readonly sourceId: string
  getCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather>
}
