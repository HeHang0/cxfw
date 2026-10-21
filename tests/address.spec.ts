import { describe, expect, it } from 'vitest'
import { shortenFenceAddress } from '@/core/domain/address'

describe('shortenFenceAddress', () => {
  it('去掉区县后的镇，保留后面的详细地址', () => {
    expect(shortenFenceAddress('江苏省苏州市吴江区黎里镇明丰环湖花园')).toBe(
      '江苏省苏州市吴江区明丰环湖花园',
    )
  })

  it('没有区县时去掉市后的镇', () => {
    expect(shortenFenceAddress('浙江省嘉兴市乌镇某社区')).toBe('浙江省嘉兴市某社区')
  })

  it('地址以镇或乡结尾时保留该乡镇', () => {
    expect(shortenFenceAddress('浙江省嘉兴市乌镇')).toBe('浙江省嘉兴市乌镇')
    expect(shortenFenceAddress('江苏省苏州市吴江区黎里镇')).toBe(
      '江苏省苏州市吴江区黎里镇',
    )
    expect(shortenFenceAddress('四川省成都市双流区某乡')).toBe(
      '四川省成都市双流区某乡',
    )
  })

  it('去掉乡但保留社区', () => {
    expect(shortenFenceAddress('四川省成都市双流区某乡某社区')).toBe(
      '四川省成都市双流区某社区',
    )
  })

  it('不误删以镇结尾的城市名', () => {
    expect(shortenFenceAddress('江西省景德镇市珠山区')).toBe('江西省景德镇市珠山区')
  })

  it('去掉连续重复的行政区段', () => {
    expect(shortenFenceAddress('上海市上海市青浦区')).toBe('上海市青浦区')
    expect(shortenFenceAddress('江苏省苏州市苏州市吴江区')).toBe('江苏省苏州市吴江区')
  })

  it('空地址保持不变', () => {
    expect(shortenFenceAddress(null)).toBeNull()
    expect(shortenFenceAddress('')).toBeNull()
  })
})
