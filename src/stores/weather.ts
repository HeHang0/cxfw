import { ref } from 'vue'
import { defineLiteStore } from './lite'
import type { CurrentWeather, WeatherCopyCategory } from '@/core/domain/weather'
import { DEFAULT_WEATHER_COPY } from '@/core/domain/weather'
import { getContainer } from '@/services/container'

export const useWeatherStore = defineLiteStore(() => {
  const service = getContainer().weatherService
  const copy = ref<string>(DEFAULT_WEATHER_COPY)
  const category = ref<WeatherCopyCategory>('fallback')
  const weather = ref<CurrentWeather | null>(null)
  const loading = ref(false)

  async function loadFromLocation(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      const result = await service.getGreeting(latitude, longitude)
      copy.value = result.copy
      category.value = result.category
      weather.value = result.weather
    } catch {
      useFallback()
    } finally {
      loading.value = false
    }
  }

  function useFallback(): void {
    copy.value = DEFAULT_WEATHER_COPY
    category.value = 'fallback'
    weather.value = null
  }

  return {
    copy,
    category,
    weather,
    loading,
    loadFromLocation,
    useFallback,
  }
})
