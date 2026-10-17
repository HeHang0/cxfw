import type { DateKey } from '../domain/identifiers'

export interface FuelPriceQuote {
  readonly province: string
  readonly priceDate: DateKey
  readonly p92: number | null
  readonly p95: number | null
  readonly p0: number | null
  readonly p89: number | null
}

export interface FuelPriceDataSource {
  /** 查询指定省份在给定日期当天或之前最近一日的油价。 */
  getNearestPrice(province: string, date: DateKey): Promise<FuelPriceQuote | null>
}
