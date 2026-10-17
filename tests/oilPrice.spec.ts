import { describe, expect, it } from 'vitest'
import type { HttpClient, HttpRequest, HttpResponse } from '@/core/contracts/HttpClient'
import { matchProvinceFromAddress } from '@/core/domain/provinces'
import { priceForGrade } from '@/core/domain/fuelPrice'
import { tankCapacityForVehicle } from '@/core/domain/tankCapacities'
import { EastmoneyFuelPriceDataSource } from '@/infrastructure/oil/EastmoneyFuelPriceDataSource'

class FakeHttp implements HttpClient {
  lastRequest: HttpRequest | null = null

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.lastRequest = request
    return {
      statusCode: 200,
      headers: {},
      data: {
        result: {
          data: [
            {
              CITYNAME: '江苏',
              DIM_DATE: '2026-09-25 00:00:00',
              V0: 8.26,
              V89: 8.04,
              V92: 8.58,
              V95: 9.12,
            },
          ],
        },
        success: true,
        code: 0,
      },
    }
  }
}

describe('油价查询', () => {
  it('按省份和日期查询最近油价', async () => {
    const http = new FakeHttp()
    const source = new EastmoneyFuelPriceDataSource(http)
    const quote = await source.getNearestPrice('江苏', '2026-10-17')
    expect(quote).toMatchObject({
      province: '江苏',
      priceDate: '2026-09-25',
      p92: 8.58,
      p95: 9.12,
    })
    expect(decodeURIComponent(http.lastRequest?.url ?? '')).toContain(
      '(CITYNAME="江苏")(DIM_DATE<=\'2026-10-17\')',
    )
  })

  it('从最近行程地址匹配省份', () => {
    expect(matchProvinceFromAddress('江苏省苏州市吴江区')).toBe('江苏')
    expect(matchProvinceFromAddress('广西壮族自治区南宁市')).toBe('广西')
    expect(matchProvinceFromAddress('')).toBeNull()
  })

  it('98# 无独立价格时按 95# 加 2 元计算', () => {
    const quote = {
      province: '江苏',
      priceDate: '2026-09-25' as const,
      p0: 8.26,
      p89: 8.04,
      p92: 8.58,
      p95: 9.12,
    }
    expect(priceForGrade(quote, '98#')).toBe(11.12)
    expect(priceForGrade(quote, '95#')).toBe(9.12)
    expect(priceForGrade(quote, '0#')).toBe(8.26)
  })

  it('按实时车况车型名称匹配默认油箱容量', () => {
    expect(tankCapacityForVehicle('250 CLC')).toBe(13.5)
    expect(tankCapacityForVehicle('450-MT')).toBe(17.5)
    expect(tankCapacityForVehicle('未知车型')).toBe(12)
  })
})
