import { describe, expect, it } from 'vitest';
import type {
  HttpClient,
  HttpRequest,
  HttpResponse
} from '@/core/contracts/HttpClient';
import type { AuthSession } from '@/core/domain/models';
import { CfMotoApiClient } from '@/infrastructure/cfmoto/CfMotoApiClient';
import { CfMotoAuthDataSource } from '@/infrastructure/cfmoto/CfMotoAuthDataSource';
import { CfMotoRideDataSource } from '@/infrastructure/cfmoto/CfMotoRideDataSource';
import { resolveCfMotoConfig } from '@/infrastructure/cfmoto/config';
import { AppError } from '@/core/application/errors';
import { TEST_REF, TEST_RIDE_ID, TEST_USER_ID } from './helpers/fixtures';

/**
 * 数据源适配器的行为测试。
 *
 * 重点是"标识符用对了没有"和"错误处理是否统一"：
 * 这些错误在真实环境里只会表现为 4xx/500，很难定位。
 */

interface CapturedCall {
  readonly request: HttpRequest;
  readonly body: unknown;
}

class FakeHttpClient implements HttpClient {
  readonly calls: CapturedCall[] = [];
  private readonly handler: (request: HttpRequest) => HttpResponse;

  constructor(handler: (request: HttpRequest) => HttpResponse) {
    this.handler = handler;
  }

  request(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push({ request, body: request.body });
    return Promise.resolve(this.handler(request));
  }
}

const SESSION: AuthSession = {
  ticket: 'TK-1234567890',
  userId: TEST_USER_ID,
  nickname: '测试',
  isVip: true,
  loginAt: '2026-10-17T00:00:00.000Z'
};

function createClient(
  handler: (request: HttpRequest) => HttpResponse,
  options: { session?: AuthSession | null; appSecret?: string } = {}
): {
  client: CfMotoApiClient;
  http: FakeHttpClient;
  config: ReturnType<typeof resolveCfMotoConfig>;
} {
  const http = new FakeHttpClient(handler);
  const config = resolveCfMotoConfig({
    appSecret: options.appSecret ?? 'SECRET'
  });
  const client = new CfMotoApiClient({
    http,
    config,
    sessionProvider: () =>
      options.session === undefined ? SESSION : options.session
  });
  return { client, http, config };
}

function okResponse(data: unknown): HttpResponse {
  return {
    statusCode: 200,
    headers: {},
    data: { code: 0, msg: '请求成功', data }
  };
}

/** 查询参数现在拼进了 URL（签名要求签什么发什么），这里从 URL 解析回来做断言。 */
function queryOf(request: HttpRequest): Record<string, unknown> {
  const index = request.url.indexOf('?');
  if (index < 0) return {};
  const result: Record<string, unknown> = {};
  for (const pair of request.url.slice(index + 1).split('&')) {
    const [rawKey, rawValue = ''] = pair.split('=');
    if (!rawKey) continue;
    result[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
  }
  return result;
}

function headerOf(
  headers: Record<string, string> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(
    item => item.toLowerCase() === name.toLowerCase()
  );
  return key === undefined ? undefined : headers[key];
}

function queryStringOf(request: HttpRequest): string {
  const index = request.url.indexOf('?');
  return index < 0 ? '' : request.url.slice(index + 1);
}

/** POST 正文现在按"签什么发什么"发送 JSON 文本，这里解析回对象做断言。 */
function bodyOf(body: unknown): Record<string, unknown> {
  if (typeof body === 'string')
    return JSON.parse(body) as Record<string, unknown>;
  return (body ?? {}) as Record<string, unknown>;
}

describe('CfMotoRideDataSource 标识符使用', () => {
  it('月报使用车辆简表的 deviceId（T-Box）', async () => {
    const { client, http } = createClient(() =>
      okResponse({
        date: '2026-10',
        firstBindDate: '2025-09',
        total_mileage: '57.4',
        vehicle_report: []
      })
    );
    const source = new CfMotoRideDataSource({ client });
    await source.getMonthReport(TEST_REF, '2026-10');
    expect(http.calls[0]?.request.url).toContain(
      '/cfmotoservervehicle/app/ride/report/list/month'
    );
    expect(queryOf(http.calls[0]!.request)).toMatchObject({
      deviceId: TEST_REF.deviceId,
      month: '2026-10'
    });
    // Cookie 里也必须带上 vehicle_id
    expect(headerOf(http.calls[0]?.request.headers, 'cookie')).toContain(
      `vehicle_id=${TEST_REF.deviceId}`
    );
  });

  it('单日统计使用车辆列表的 vehicleId，且 date 为 epoch 毫秒', async () => {
    const { client, http } = createClient(() =>
      okResponse({
        drive_seconds: '0',
        max_speed: '0.00',
        month_mileage: '0.00',
        rapid_turn: '0',
        rapid_acceleration: '0',
        rapid_deceleration: '0'
      })
    );
    const source = new CfMotoRideDataSource({ client });
    await source.getDayStats(TEST_REF, '2026-10-16');
    const query = queryOf(http.calls[0]!.request);
    expect(query['deviceId']).toBe(TEST_REF.vehicleId);
    expect(query['deviceId']).not.toBe(TEST_REF.deviceId);
    expect(query['date']).toBe(
      String(new Date(2026, 9, 16, 0, 0, 0, 0).getTime())
    );
  });

  it('行程列表使用 T-Box deviceId，并用 endDate 毫秒作为 lastShardingId', async () => {
    const { client, http } = createClient(() => okResponse([]));
    const source = new CfMotoRideDataSource({ client });
    const page = await source.listRideHistory(TEST_REF, {
      from: '2026-10-01',
      to: '2026-10-17',
      pageNumber: 1,
      pageSize: 20
    });
    expect(queryOf(http.calls[0]!.request)).toMatchObject({
      deviceId: TEST_REF.deviceId,
      startDate: '2026-10-01 00:00:00',
      endDate: '2026-10-17 23:59:59',
      lastShardingId: String(new Date(2026, 9, 17, 23, 59, 59).getTime()),
      // 查询串里是文本，解析回来自然也是字符串
      pageNumber: '1',
      pageSize: '20'
    });
    expect(page.items).toHaveLength(0);
    // api.yaml 未给出分页总数，这里必须是 null 而不是 0
    expect(page.total).toBeNull();
  });

  it('行程详情只传 id，并解析轨迹与统计数据', async () => {
    const { client, http } = createClient(() =>
      okResponse({
        id: TEST_RIDE_ID,
        startTime: '2026-10-16 23:27:26',
        endTime: '2026-10-17 00:04:12',
        rideMileage: '27.50',
        maxSpeed: '102.00',
        ridingTime: '2206',
        accelerationTimes: '2',
        brakesTimes: '1',
        bendingTimes: '4',
        trajectory:
          '116.397477,39.908692,8.00,0.00,1792164450&116.398477,39.909692,20.00,0.05,1792164460'
      })
    );
    const source = new CfMotoRideDataSource({ client });
    const detail = await source.getRideHistoryDetail(
      TEST_REF,
      TEST_RIDE_ID
    );
    expect(queryOf(http.calls[0]!.request)).toEqual({
      id: TEST_RIDE_ID
    });
    expect(detail).toMatchObject({
      id: TEST_RIDE_ID,
      distanceKm: 27.5,
      durationSeconds: 2206,
      maxSpeedKph: 102,
      accelerationTimes: 2,
      brakesTimes: 1,
      bendingTimes: 4
    });
    expect(detail.trajectory).toHaveLength(2);
  });

  it('车辆状态按 vin 查询，并解析功能列表 / 提醒设置 / 电子围栏（真实样例结构）', async () => {
    const { client, http } = createClient(() =>
      okResponse({
        vin: TEST_REF.vin,
        simExpire: false,
        simExpireTime: '2027-09-24',
        simFreeDate: 342,
        electricFenceList: [
          {
            rideRangeName: '电子围栏-测试地点',
            address: '北京市东城区天安门广场',
            radius: 0.5,
            addrPosition: '116.397477,39.908692'
          }
        ],
        vehicleFunctionList: [
          { id: 34, isSupport: true, name: '骑行事件统计', sign: 4, type: 0 },
          { id: 16, isSupport: false, name: 'OTA升级', sign: 1, type: 4 }
        ],
        vehicleMessageSet: [
          { enable: true, threshold: '50', type: '2' },
          { enable: false, threshold: '', type: '14' }
        ],
        vehicleSet: {
          deviceId: TEST_REF.deviceId,
          themeName: '1号主题',
          lowPower: '20',
          mileageUnit: '1'
        }
      })
    );
    const source = new CfMotoRideDataSource({ client });
    const state = await source.getVehicleState(TEST_REF);
    expect(queryOf(http.calls[0]!.request)).toMatchObject({
      vin: TEST_REF.vin
    });
    expect(state.vin).toBe(TEST_REF.vin);
    expect(state.simExpire).toBe(false);
    expect(state.simFreeDays).toBe(342);
    expect(state.electricFences[0]).toMatchObject({
      name: '电子围栏-测试地点',
      radiusKm: 0.5,
      position: '116.397477,39.908692'
    });
    expect(state.functions).toEqual([
      { id: '34', name: '骑行事件统计', supported: true },
      { id: '16', name: 'OTA升级', supported: false }
    ]);
    expect(state.messageSettings).toEqual([
      { type: '2', enabled: true, threshold: '50' },
      { type: '14', enabled: false, threshold: null }
    ]);
    // 语义明确的设置项被解析，含义未确认的编码保留在 raw 里
    expect(state.settings?.themeName).toBe('1号主题');
    expect(state.settings?.lowPowerPercent).toBe(20);
    expect(state.settings?.raw['mileageUnit']).toBe('1');
  });

  it('把当前车辆的摔车提醒开关合并到消息提醒', async () => {
    const { client, http } = createClient(request => {
      if (request.url.includes('/breakdown/rescue/setting')) {
        return okResponse([
          {
            vehicleCrashRescueServiceSwitch: false,
            vehicleName: 'CF250-12',
            vehiclePicUrl: 'https://example.com/bike.png',
            vin: TEST_REF.vin
          }
        ]);
      }
      return okResponse({
        vin: TEST_REF.vin,
        vehicleMessageSet: []
      });
    });
    const source = new CfMotoRideDataSource({ client });
    const state = await source.getVehicleState(TEST_REF);

    expect(state.messageSettings).toContainEqual({
      type: 'crashRescue',
      enabled: false,
      threshold: null
    });
    expect(
      http.calls.some(call =>
        call.request.url.includes(
          '/cfmotoservervehicle/app/user/vehicle/breakdown/rescue/setting'
        )
      )
    ).toBe(true);
  });

  it('车辆列表会合并 list 与 option 的结果', async () => {
    const { client, http } = createClient(request => {
      if (request.url.includes('/app/vehicle/list')) {
        return okResponse([
          {
            vehicleId: Number(TEST_REF.vehicleId),
            vin: TEST_REF.vin,
            equipmentNum: TEST_REF.equipmentNum,
            vehicleType: 'CF250-12'
          }
        ]);
      }
      return okResponse([
        {
          deviceId: TEST_REF.deviceId,
          vehicleName: 'CF250-12',
          vin: TEST_REF.vin,
          bindDate: '2025-09-24 23:37:32'
        }
      ]);
    });
    const source = new CfMotoRideDataSource({ client });
    const vehicles = await source.listVehicles();
    expect(http.calls).toHaveLength(2);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      vehicleId: TEST_REF.vehicleId,
      deviceId: TEST_REF.deviceId,
      vin: TEST_REF.vin,
      model: 'CF250-12',
      equipmentNum: TEST_REF.equipmentNum
    });
  });

  it('实时车况先按 equipmentNum 取 vehicleTypeId，再按 T-Box deviceId 查询油量/信号/电压', async () => {
    const { client, http } = createClient(request => {
      if (request.url.includes('/app/vehicle/detail/v1')) {
        return okResponse({
          deviceId: TEST_REF.deviceId,
          deviceState: 'ONLINE',
          vehicleType: '250 CLC',
          vehicleTypeId: 2653,
          vehicleTypeImageUrl: 'https://example.com/bike.png',
          remainingOil: '3',
          totalOilNum: 6,
          remainingOilDisplay: '充足',
          gsmRxLev: 28,
          gsmRxLevStr: '强',
          fireVoltage: 13.3,
          fireVoltageDisplay: '正常',
          fireVoltageThreshold: 12,
          dataLastUpdateTime: '2026/10/17 00:04',
          totalRideMile: 9347.5,
          rideMileageMonth: '391900.00',
          ridingTimeMonth: '52630',
          avgRideSpeed: '26.81',
          geoLocation: {
            altitude: 5,
            latitude: 39.908692,
            longitude: 116.397477,
            report: { datetime: 1792166664 }
          },
          vehicleRideHistoryListVO: {
            dateYmd: '2026-10-16',
            id: TEST_RIDE_ID,
            shardingId: 'TEST-SHARD-0001',
            rideMileage: '27.50',
            ridingTime: '2206',
            maxSpeed: '102.00',
            startTime: '2026-10-16 23:27:26',
            endTime: '2026-10-17 00:04:12',
            startAddr: '起点',
            endAddr: '终点'
          }
        });
      }
      return okResponse({
        deviceId: Number(TEST_REF.deviceId),
        deviceName: TEST_REF.equipmentNum,
        itemCode: '6KM2-CNE0C4-BM2S',
        vehicleTypeId: 2653,
        vinNo: TEST_REF.vin
      });
    });
    const source = new CfMotoRideDataSource({ client });
    const telemetry = await source.getVehicleTelemetry(TEST_REF);

    const detailCall = http.calls.find(call =>
      call.request.url.includes('/app/vehicle/detail?')
    );
    const liveCall = http.calls.find(call =>
      call.request.url.includes('/app/vehicle/detail/v1')
    );
    expect(queryOf(detailCall!.request)).toMatchObject({
      deviceName: TEST_REF.equipmentNum
    });
    expect(queryOf(liveCall!.request)).toMatchObject({
      deviceId: TEST_REF.deviceId,
      type: '2653'
    });
    expect(http.calls).toHaveLength(2);
    expect(telemetry).toMatchObject({
      vehicleTypeName: '250 CLC',
      online: true,
      remainingOil: 3,
      totalOilSegments: 6,
      oilPercent: 50,
      signalLevel: 28,
      signalText: '强',
      batteryVoltage: 13.3,
      batteryVoltageDisplay: '正常',
      monthMileageKm: 391.9,
      monthDurationSeconds: 52630,
      averageSpeedKph: 26.81
    });
    expect(telemetry.recentRide).toMatchObject({
      id: TEST_RIDE_ID,
      distanceKm: 27.5,
      durationSeconds: 2206,
      maxSpeedKph: 102
    });
  });

  it('月度油耗使用 T-Box deviceId，并解析 powerUseMonth 与 useList', async () => {
    const { client, http } = createClient(() =>
      okResponse({
        firstBindDate: '2025-09',
        powerUseMonth: '12.34',
        powerUseMonthNew: '12.345',
        useList: [
          {
            date: 1790784000000,
            powerUseDate: '2026-10-01',
            powerUseValue: '1.2'
          },
          {
            date: 1790870400000,
            powerUseDate: '2026-10-02',
            powerUseValue: '2.5'
          }
        ]
      })
    );
    const source = new CfMotoRideDataSource({ client });
    const fuel = await source.getMonthlyFuel(TEST_REF, '2026-10');
    expect(queryOf(http.calls[0]!.request)).toMatchObject({
      deviceId: TEST_REF.deviceId,
      month: '2026-10'
    });
    expect(fuel.totalLiters).toBe(12.34);
    expect(fuel.totalLitersPrecise).toBe(12.345);
    expect(fuel.days).toEqual([
      { date: '2026-10-01', liters: 1.2 },
      { date: '2026-10-02', liters: 2.5 }
    ]);
  });
});

describe('CfMotoApiClient 统一错误处理', () => {
  it('缺少 APP_SECRET 时以 CONFIG 错误快速失败', async () => {
    const { client, http } = createClient(() => okResponse({}), {
      appSecret: ''
    });
    await expect(
      client.call({ path: '/x', method: 'GET' })
    ).rejects.toMatchObject({ code: 'CONFIG' });
    expect(http.calls).toHaveLength(0);
  });

  it('未登录时不发送请求', async () => {
    const { client, http } = createClient(() => okResponse({}), {
      session: null
    });
    await expect(
      client.call({ path: '/x', method: 'GET', requiresAuth: true })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });
    expect(http.calls).toHaveLength(0);
  });

  it('登录前接口不要求 ticket', async () => {
    const { client, http } = createClient(() => okResponse({ code: 0 }), {
      session: null
    });
    await client.call({
      path: '/auth',
      method: 'POST',
      body: { phone: '13900000000' },
      requiresAuth: false
    });
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]?.request.headers?.['cookie']).toBeUndefined();
  });

  it('业务 code 非 0 时抛出 BUSINESS 错误并保留原始 code', async () => {
    const { client } = createClient(() => ({
      statusCode: 200,
      headers: {},
      data: { code: 5001, msg: '车辆不存在' }
    }));
    await expect(
      client.call({ path: '/x', method: 'GET' })
    ).rejects.toMatchObject({
      code: 'BUSINESS',
      details: { businessCode: 5001 }
    });
  });

  it('msg 提到 ticket 时归类为 UNAUTHORIZED', async () => {
    const { client } = createClient(() => ({
      statusCode: 200,
      headers: {},
      data: { code: 1001, msg: 'ticket 已失效' }
    }));
    await expect(
      client.call({ path: '/x', method: 'GET' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('凭证失效时触发一次 onUnauthorized（并发 401 只通知一次）', async () => {
    let notified = 0;
    const http = new FakeHttpClient(() => ({
      statusCode: 200,
      headers: {},
      data: { code: 1001, msg: 'ticket 已失效' }
    }));
    const client = new CfMotoApiClient({
      http,
      config: resolveCfMotoConfig({ appSecret: 'SECRET' }),
      sessionProvider: () => SESSION,
      onUnauthorized: () => {
        notified += 1;
      }
    });
    await client.call({ path: '/x', method: 'GET' }).catch(() => undefined);
    await client.call({ path: '/y', method: 'GET' }).catch(() => undefined);
    expect(notified).toBe(1);
  });

  it('响应不是 BaseResponse 结构时报 PARSE 错误', async () => {
    const { client } = createClient(() => ({
      statusCode: 200,
      headers: {},
      data: { foo: 'bar' }
    }));
    await expect(
      client.call({ path: '/x', method: 'GET' })
    ).rejects.toMatchObject({ code: 'PARSE' });
  });

  it('HTTP 5xx 归类为 HTTP 且可重试', async () => {
    const { client } = createClient(() => ({
      statusCode: 502,
      headers: {},
      data: ''
    }));
    const error = await client
      .call({ path: '/x', method: 'GET' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'HTTP', retriable: true });
  });

  it('每次请求都带上 api.yaml 要求的签名相关请求头', async () => {
    const { client, http } = createClient(() => okResponse({}));
    await client.call({ path: '/x', method: 'GET' });
    const headers = http.calls[0]?.request.headers ?? {};
    for (const key of [
      'X-App-Info',
      'interfaceversion',
      'Cfmoto-X-Param',
      'Cfmoto-X-Sign',
      'signature',
      'Cfmoto-X-Sign-Type',
      'appId',
      'nonce',
      'timestamp',
      'cookie'
    ]) {
      expect(headerOf(headers, key), `缺少请求头 ${key}`).toBeDefined();
    }
    // 密钥不能出现在任何请求头里
    expect(JSON.stringify(headers)).not.toContain('SECRET');
  });

  it('签名 payload 是「按 URL 顺序的查询串原文」（与 apifox-prerequest.js 一致）', async () => {
    const { client, http } = createClient(() => okResponse({}));
    await client.call({
      path: '/x',
      method: 'GET',
      query: { deviceId: TEST_REF.deviceId, month: '2026-10' }
    });
    const request = http.calls[0]!.request;
    const headers = request.headers ?? {};
    const qs = queryStringOf(request);
    expect(qs).toBe(`deviceId=${TEST_REF.deviceId}&month=2026-10`);
    // 用同一个串复算签名，必须与请求头一致
    const { md5 } = await import('@/infrastructure/cfmoto/crypto/md5');
    const { sha1 } = await import('@/infrastructure/cfmoto/crypto/sha1');
    const expected = md5(sha1(`${qs}${headers['Cfmoto-X-Param']}SECRET`));
    expect(headers['Cfmoto-X-Sign']).toBe(expected);
  });

  it('查询参数带空格时按百分号编码后签名与发送', async () => {
    const { client, http } = createClient(() => okResponse([]));
    await client.call({
      path: '/x',
      method: 'GET',
      query: { startDate: '2026-10-01 00:00:00' }
    });
    const qs = queryStringOf(http.calls[0]!.request);
    expect(qs).toBe('startDate=2026-10-01%2000%3A00%3A00');
  });
});

describe('CfMotoAuthDataSource', () => {
  it('验证码登录解析出 ticket 与 userId', async () => {
    const { client, http } = createClient(() =>
      okResponse({
        ticket: 'TK-abc',
        user_id: Number(TEST_USER_ID),
        nickname: '测试用户',
        is_vip: true
      })
    );
    const auth = new CfMotoAuthDataSource({ client });
    const session = await auth.loginByVerifyCode({
      phone: '13900000000',
      verifyCode: '123456'
    });
    expect(session.ticket).toBe('TK-abc');
    expect(session.userId).toBe(TEST_USER_ID);
    const body = bodyOf(http.calls[0]?.body);
    expect(body).toMatchObject({
      phone: '13900000000',
      verify_code: '123456',
      version: '5.9.4'
    });
  });

  it('登录响应缺少 ticket 时报 PARSE，并提示接口未实测', async () => {
    const { client } = createClient(() => okResponse({ token: 'x' }));
    const auth = new CfMotoAuthDataSource({ client });
    await expect(
      auth.loginByVerifyCode({ phone: '13900000000', verifyCode: '123456' })
    ).rejects.toMatchObject({
      code: 'PARSE'
    });
  });

  it('未实测接口无法判定时返回 null，不臆造结论', async () => {
    const { client } = createClient(() => okResponse({ something: true }));
    const auth = new CfMotoAuthDataSource({ client });
    expect(await auth.checkTicket(SESSION)).toBeNull();
    expect(await auth.checkRegistered('13900000000')).toBeNull();
  });

  it('发送验证码的请求体与 api.yaml 一致', async () => {
    const { client, http } = createClient(() => okResponse({}));
    const auth = new CfMotoAuthDataSource({ client });
    await auth.sendVerifyCode('13900000000', { voice: true });
    expect(bodyOf(http.calls[0]?.body)).toEqual({
      phone: '13900000000',
      msg_type: 0,
      voice: true
    });
  });
});
