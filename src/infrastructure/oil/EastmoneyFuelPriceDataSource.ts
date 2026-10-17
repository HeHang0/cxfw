import { AppError } from '@/core/application/errors'
import type { FuelPriceDataSource, FuelPriceQuote } from '@/core/contracts/FuelPriceDataSource'
import type { HttpClient } from '@/core/contracts/HttpClient'
import { extractDateKey } from '@/core/domain/datetime'
import type { DateKey } from '@/core/domain/identifiers'
import { parseNullableNumber } from '@/core/domain/numbers'

const BASE_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get'

export class EastmoneyFuelPriceDataSource implements FuelPriceDataSource {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async getNearestPrice(province: string, date: DateKey): Promise<FuelPriceQuote | null> {
    const params: Array<[string, string]> = [
      ['reportName', 'RPTA_WEB_YJ_JH'],
      ['columns', 'CITYNAME,DIM_DATE,V0,V89,V92,V95'],
      ['sortColumns', 'DIM_DATE'],
      ['sortTypes', '-1'],
      ['pageNumber', '1'],
      ['pageSize', '1'],
      ['filter', `(CITYNAME="${province}")(DIM_DATE<='${date}')`],
    ]
    const query = params
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')

    const response = await this.http.request({
      url: `${BASE_URL}?${query}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeoutMs: 15000,
    })
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new AppError(`油价查询失败（HTTP ${response.statusCode}）`, { code: 'HTTP', retriable: true })
    }

    const record = asRecord(response.data)
    const result = asRecord(record['result'])
    const rows = Array.isArray(result['data']) ? result['data'] : []
    const first = asRecord(rows[0])
    if (Object.keys(first).length === 0) return null
    const priceDate = extractDateKey(first['DIM_DATE'])
    if (!priceDate) return null

    return {
      province: String(first['CITYNAME'] ?? province),
      priceDate,
      p0: parseNullableNumber(first['V0']),
      p89: parseNullableNumber(first['V89']),
      p92: parseNullableNumber(first['V92']),
      p95: parseNullableNumber(first['V95']),
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
