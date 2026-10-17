export interface ProvinceOption {
  readonly name: string
  readonly fullName: string
}

/** 国内省级行政区（含港澳台），名称与油价接口的 CITYNAME 保持一致。 */
export const CHINA_PROVINCES: readonly ProvinceOption[] = [
  { name: '北京', fullName: '北京市' },
  { name: '天津', fullName: '天津市' },
  { name: '河北', fullName: '河北省' },
  { name: '山西', fullName: '山西省' },
  { name: '内蒙古', fullName: '内蒙古自治区' },
  { name: '辽宁', fullName: '辽宁省' },
  { name: '吉林', fullName: '吉林省' },
  { name: '黑龙江', fullName: '黑龙江省' },
  { name: '上海', fullName: '上海市' },
  { name: '江苏', fullName: '江苏省' },
  { name: '浙江', fullName: '浙江省' },
  { name: '安徽', fullName: '安徽省' },
  { name: '福建', fullName: '福建省' },
  { name: '江西', fullName: '江西省' },
  { name: '山东', fullName: '山东省' },
  { name: '河南', fullName: '河南省' },
  { name: '湖北', fullName: '湖北省' },
  { name: '湖南', fullName: '湖南省' },
  { name: '广东', fullName: '广东省' },
  { name: '广西', fullName: '广西壮族自治区' },
  { name: '海南', fullName: '海南省' },
  { name: '重庆', fullName: '重庆市' },
  { name: '四川', fullName: '四川省' },
  { name: '贵州', fullName: '贵州省' },
  { name: '云南', fullName: '云南省' },
  { name: '西藏', fullName: '西藏自治区' },
  { name: '陕西', fullName: '陕西省' },
  { name: '甘肃', fullName: '甘肃省' },
  { name: '青海', fullName: '青海省' },
  { name: '宁夏', fullName: '宁夏回族自治区' },
  { name: '新疆', fullName: '新疆维吾尔自治区' },
  { name: '台湾', fullName: '台湾省' },
  { name: '香港', fullName: '香港特别行政区' },
  { name: '澳门', fullName: '澳门特别行政区' },
]

export function matchProvinceFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const match = CHINA_PROVINCES.find(
    (province) => address.includes(province.fullName) || address.includes(province.name),
  )
  return match?.name ?? null
}
