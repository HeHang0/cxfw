/** 官方接口路径（全部来自 api.yaml，未做任何猜测）。 */

export const CFMOTO_PATHS = {
  /** 发送短信验证码。POST，body: { phone, msg_type?, voice? } */
  sendVerifyCode: '/cfmotoservermall/user/code/sendCode/',
  /** 短信验证码登录，成功返回 ticket。POST，body: { phone, verify_code, version } */
  loginByVerifyCode: '/cfmotoservermall/user/loginByVerifycode/',
  /** 手机号密码登录。POST，body: { phone, password }（api.yaml 标注未实测） */
  loginByPassword: '/cfmotoservermall/user/loginByPhone/',
  /** 手机号是否已注册。GET ?phone=（未实测） */
  checkRegistered: '/auth/user/check_if_registered/',
  /** 检查 ticket 是否有效。GET ?ticket=（未实测） */
  checkTicketExpire: '/auth/ticket/ticket_expire/',
  /** 登出。POST，无请求体（未实测） */
  logout: '/cfmotoservermall/user/logout/',
  /** 个人信息。GET */
  userInfo: '/cfmotoservermall/user/info',
  /** 车辆列表（提供 vehicleId）。GET ?userId= */
  vehicleList: '/cfmotoservervehicle/app/vehicle/list',
  /** 车辆简表（提供 deviceId）。GET */
  vehicleOption: '/cfmotoservervehicle/app/vehicle/option',
  /** 车辆状态总览。GET ?vin= */
  vehicleStateOverview: '/cfmotoservervehicle/app/vehicle/state/overview/v2',
  /** 所有车辆的摔车提醒开关。GET */
  vehicleCrashRescueSettings: '/cfmotoservervehicle/app/user/vehicle/breakdown/rescue/setting',
  /** 车辆明细（拿 vehicleTypeId）。GET ?deviceName=<equipmentNum> */
  vehicleDetail: '/cfmotoservervehicle/app/vehicle/detail',
  /** 实时车况：油量/信号/电压/位置/最近行程。GET ?deviceId=<T-Box>&type=<vehicleTypeId> */
  vehicleNowInfo: '/cfmotoservervehicle/app/vehicle/detail/v1',
  /** 月度骑行报表（按天）。GET ?deviceId=<T-Box deviceId>&month=yyyy-MM */
  monthRideReport: '/cfmotoservervehicle/app/ride/report/list/month',
  /** 单日骑行统计。GET ?deviceId=<vehicleId>&date=<epoch ms> */
  dayRideReport: '/cfmotoservervehicle/app/ride/report/v2',
  /** 月度油耗（按天）。GET ?deviceId=<T-Box deviceId>&month=yyyy-MM */
  monthlyFuel: '/cfmotoservervehicle/app/power/list/month',
  /** 单次行程列表。GET ?deviceId=<vehicleId>&... */
  rideHistoryList: '/cfmotoservervehicle/app/ridehistory/list',
  /** 单次行程详情。GET ?id= */
  rideHistoryDetail: '/cfmotoservervehicle/app/ridehistory',
} as const

export type CfMotoPath = (typeof CFMOTO_PATHS)[keyof typeof CFMOTO_PATHS]
