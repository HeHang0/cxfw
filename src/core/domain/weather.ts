export interface CurrentWeather {
  readonly province: string | null;
  readonly city: string | null;
  readonly district: string | null;
  readonly adcode: string | null;
  readonly updateTime: string | null;
  readonly condition: string;
  readonly temperatureC: number | null;
  readonly windDirection: string | null;
  readonly windPower: string | null;
  readonly windPowerV2: string | null;
  readonly humidityPercent: number | null;
  readonly airPressureHpa: number | null;
}

export type WeatherCopyCategory =
  | 'sunny'
  | 'cloudy'
  | 'rain'
  | 'wind'
  | 'cold'
  | 'hot'
  | 'thunder'
  | 'heavy-rain'
  | 'fog'
  | 'snow'
  | 'dust'
  | 'severe'
  | 'fallback';

const SUNNY_COPY = [
  '天朗风轻，出发正当时',
  '今天阳光正好，适合去兜兜风',
  '好天气值得一段好路程',
  '风景正好，不妨骑出去看看',
  '把今天的好天气，留在路上',
  '云淡风轻，正是出发的好时候',
  '趁着天光正好，去见一程风物',
  '晴日有约，山水为伴'
] as const;

const CLOUDY_COPY = [
  '云朵慢慢走，今天也不妨慢慢骑',
  '没有烈日，倒是多了几分清爽',
  '天色温柔，适合沿着熟悉的路走走',
  '云影落在路上，风景另有一番模样',
  '不必追赶阳光，每一种天气都有风景',
  '今天的天空低调，路上的风景依旧',
  '云层渐开，也许会遇见意外的晴朗',
  '慢一点也好，沿途自有风物'
] as const;

const RAIN_COPY = [
  '雨落有声，今天不妨慢下来',
  '路面湿滑，平安比远方更重要',
  '雨天路滑，愿每一程都稳稳当当',
  '今天适合听雨，也适合早点回家',
  '雨雾渐起，出发前先确认路况',
  '风雨暂歇时，再去看沿途风景',
  '今天先歇一歇，把下一程留给晴天',
  '雨水洗过山野，等天晴再去相逢',
  '若要出发，请放慢速度，留足距离',
  '天气不赶路，平安自有归期'
] as const;

const WIND_COPY = [
  '风势较大，骑行前请留意横风',
  '今天风有些急，路上多留一分余地'
] as const;

const COLD_COPY = [
  '天气转凉，出门记得做好保暖',
  '寒意渐浓，注意手部与颈部保暖'
] as const;

const HOT_COPY = [
  '日头正盛，记得补水并避开高温时段',
  '盛夏骑行，防暑和补水都别忘了'
] as const;

const THUNDER_COPY = [
  '雷雨将至，建议暂缓出发',
  '雷电天气，请先留在安全的室内',
  '听到雷声时，请远离空旷路段'
] as const;

const HEAVY_RAIN_COPY = [
  '雨势较强，请优先选择安全的出行方式',
  '强降雨天气，请避开积水与低洼路段',
  '雨势正急，等路况稳定后再出发'
] as const;

const FOG_COPY = [
  '能见度较低，建议暂缓骑行',
  '雾天视线受阻，出发前请先确认路况',
  '雾色虽美，也要把安全放在第一位'
] as const;

const SNOW_COPY = [
  '雪天路滑，建议暂缓骑行',
  '风雪天气，请优先选择稳妥的出行方式'
] as const;

const DUST_COPY = [
  '沙尘天气，请减少户外停留并暂缓骑行',
  '风沙较大，出门记得做好防护'
] as const;

const SEVERE_COPY = [
  '今天先把平安放在第一位',
  '天气不佳，请优先选择安全的出行方式'
] as const;

const FALLBACK_COPY = [
  '春有序，行有迹，风有物',
  '不必走得很远，也能遇见好风物',
  '今天的风景，值得亲自去看看',
  '愿每一次出发，都有好风景',
  '记录每一程，珍藏每一程'
] as const;

const COPY_BY_CATEGORY: Record<WeatherCopyCategory, readonly string[]> = {
  sunny: SUNNY_COPY,
  cloudy: CLOUDY_COPY,
  rain: RAIN_COPY,
  wind: WIND_COPY,
  cold: COLD_COPY,
  hot: HOT_COPY,
  thunder: THUNDER_COPY,
  'heavy-rain': HEAVY_RAIN_COPY,
  fog: FOG_COPY,
  snow: SNOW_COPY,
  dust: DUST_COPY,
  severe: SEVERE_COPY,
  fallback: FALLBACK_COPY
};

export const DEFAULT_WEATHER_COPY = FALLBACK_COPY[0];

const THUNDER_CONDITIONS = new Set(['雷阵雨', '雷阵雨伴有冰雹']);

const HEAVY_RAIN_CONDITIONS = new Set([
  '暴雨',
  '大暴雨',
  '特大暴雨',
  '大到暴雨',
  '暴雨到大暴雨',
  '大暴雨到特大暴雨'
]);

const RAIN_CONDITIONS = new Set([
  '阵雨',
  '小雨',
  '中雨',
  '大雨',
  '雨',
  '小到中雨',
  '中到大雨'
]);

const SNOW_CONDITIONS = new Set([
  '雨夹雪',
  '冻雨',
  '阵雪',
  '小雪',
  '中雪',
  '大雪',
  '暴雪',
  '小到中雪',
  '中到大雪',
  '大到暴雪',
  '雪'
]);

const FOG_CONDITIONS = new Set([
  '雾',
  '浓雾',
  '强浓雾',
  '大雾',
  '特强浓雾',
  '霾',
  '中度霾',
  '重度霾',
  '严重霾'
]);

const DUST_CONDITIONS = new Set(['浮尘', '扬沙', '沙尘暴', '强沙尘暴']);

const CLOUDY_CONDITIONS = new Set(['多云', '阴']);

export function classifyWeather(weather: CurrentWeather): WeatherCopyCategory {
  const condition = weather.condition.trim();
  if (THUNDER_CONDITIONS.has(condition)) return 'thunder';
  if (HEAVY_RAIN_CONDITIONS.has(condition)) return 'heavy-rain';
  if (SNOW_CONDITIONS.has(condition)) return 'snow';
  if (FOG_CONDITIONS.has(condition)) return 'fog';
  if (DUST_CONDITIONS.has(condition)) return 'dust';
  if (RAIN_CONDITIONS.has(condition)) return 'rain';

  const windLevel = maxWindLevel(weather);
  if (windLevel !== null && windLevel >= 5) return 'wind';
  if (weather.temperatureC !== null && weather.temperatureC <= 5) return 'cold';
  if (weather.temperatureC !== null && weather.temperatureC >= 35) return 'hot';
  if (condition === '晴天') return 'sunny';
  if (CLOUDY_CONDITIONS.has(condition)) return 'cloudy';
  return 'fallback';
}

export function selectWeatherCopy(
  weather: CurrentWeather | null,
  seed: string
): { readonly category: WeatherCopyCategory; readonly copy: string } {
  const category = weather === null ? 'fallback' : classifyWeather(weather);
  const copies = COPY_BY_CATEGORY[category];
  const index = hashString(`${category}|${seed}`) % copies.length;
  return { category, copy: copies[index] ?? DEFAULT_WEATHER_COPY };
}

function maxWindLevel(weather: CurrentWeather): number | null {
  const text = weather.windPowerV2 ?? weather.windPower;
  if (!text) return null;
  if (text.includes('大风')) return 6;
  const levels = text.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  return levels.length === 0 ? null : Math.max(...levels);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
