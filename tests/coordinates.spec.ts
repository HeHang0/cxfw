import { describe, expect, it } from 'vitest'
import { wgs84ToGcj02 } from '@/core/domain/coordinates'

describe('地图坐标转换', () => {
  it('把 WGS84 坐标转换为 GCJ-02', () => {
    const [lat, lng] = wgs84ToGcj02(39.908692, 116.397477)
    expect(lat).toBeCloseTo(39.910054, 3)
    expect(lng).toBeCloseTo(116.403749, 3)
  })
})
