import type {
  AuthCapabilities,
  AuthDataSource,
  LoginByVerifyCodeInput
} from '@/core/contracts/AuthDataSource';
import type {
  RideDataSource,
  RideDataSourceCapabilities
} from '@/core/contracts/RideDataSource';
import type { Clock } from '@/core/contracts/Clock';
import { enumerateDates, formatDate, monthOf } from '@/core/domain/datetime';
import type { DateKey, MonthKey, VehicleRef } from '@/core/domain/identifiers';
import type {
  AuthSession,
  DayRideStats,
  MonthRideReport,
  MonthlyFuelConsumption,
  Paged,
  RideHistoryDetail,
  RideHistoryItem,
  RideHistoryQuery,
  UserProfile,
  Vehicle,
  VehicleState,
  VehicleTelemetry
} from '@/core/domain/models';
import {
  createMonthRideReport,
  createDayRideStats
} from '@/core/domain/validation';
import { AppError } from '@/core/application/errors';
import { PREVIEW_TICKET } from '@/core/domain/preview';

/**
 * 仅供开发预览的假数据源。
 *
 * 它**不是**官方接口实现，只是在缺少 APP_SECRET、无法访问官方接口时，
 * 让页面骨架（加载/错误/空状态、导航、图表占位）可以完整跑通。
 * 可通过 `VITE_DATA_SOURCE=fixture` 全局启用，或在 `test/test` 预览会话中按 ticket 路由启用。
 */

export const FIXTURE_VEHICLE: Vehicle = {
  vehicleId: '9000000001',
  deviceId: '99000000000001',
  vin: 'LTEST00000000001',
  equipmentNum: '869999000000001',
  model: '450SR',
  imageUrl: null,
  bindDate: '2025-01-15 10:00:00'
};

export const FIXTURE_REF: VehicleRef = {
  vehicleId: FIXTURE_VEHICLE.vehicleId ?? '',
  deviceId: FIXTURE_VEHICLE.deviceId ?? '',
  vin: FIXTURE_VEHICLE.vin,
  equipmentNum: FIXTURE_VEHICLE.equipmentNum
};

export const FIXTURE_FIRST_BIND_MONTH: MonthKey = '2025-01';

export const FIXTURE_PROFILE: UserProfile = {
  userId: 'demo-user',
  nickname: '演示骑士',
  phone: null,
  cfmotoNumber: 'DEMO0001',
  isVip: false,
  avatarUrl: null,
  joinedMonth: '2025-01',
  joinedAt: '2025-01-15'
};

/** 由字符串派生的确定性伪随机数，保证每次启动看到的数据一致。 */
function seededValue(seed: string, index: number): number {
  let hash = 2166136261;
  const text = `${seed}#${index}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash % 100000) / 100000;
}

export class FixtureRideDataSource implements RideDataSource {
  readonly sourceId = 'fixture';
  readonly capabilities: RideDataSourceCapabilities = {
    monthReport: {
      available: true,
      status: 'unverified',
      supportsArbitraryMonth: true,
      note: '假数据源：模拟月报，用于本地预览页面骨架'
    },
    dayStats: { available: true, status: 'unverified', note: '假数据源' },
    rapidEvents: { available: true, viaDayStats: true, note: '假数据源' },
    vehicleState: { available: true, status: 'unverified' },
    history: {
      available: true,
      status: 'unverified',
      note: '假数据源返回空列表'
    },
    aggregatedReports: {
      source: 'monthly-aggregation',
      note: '假数据源同样只提供月报'
    }
  };

  private readonly clock: Clock;

  constructor(options: { clock: Clock }) {
    this.clock = options.clock;
  }

  async listVehicles(): Promise<Vehicle[]> {
    return [{ ...FIXTURE_VEHICLE }];
  }

  async getVehicleState(ref: VehicleRef): Promise<VehicleState> {
    return {
      vin: ref.vin,
      simExpire: false,
      simExpireTime: '2027-09-24',
      simFreeDays: 342,
      electricFences: [
        {
          name: '电子围栏-测试地点',
          address: '北京市东城区天安门广场',
          radiusKm: 0.5,
          position: '116.397477,39.908692'
        }
      ],
      functions: [
        { id: '34', name: '骑行事件统计', supported: true },
        { id: '15', name: '低油量提醒', supported: true },
        { id: '16', name: 'OTA升级', supported: true },
        { id: '17', name: '胎压监测', supported: false }
      ],
      messageSettings: [
        { type: '2', enabled: true, threshold: '50' },
        { type: '3', enabled: true, threshold: '1' },
        { type: '14', enabled: false, threshold: null },
        { type: 'crashRescue', enabled: true, threshold: null }
      ],
      settings: {
        deviceId: ref.deviceId,
        themeName: '1号主题',
        lowPowerPercent: 20,
        raw: {
          deviceId: ref.deviceId,
          themeName: '1号主题',
          lowPower: '20',
          mileageUnit: '1'
        }
      },
      issues: []
    };
  }

  async getVehicleTelemetry(ref: VehicleRef): Promise<VehicleTelemetry> {
    return {
      deviceId: ref.deviceId,
      deviceName: ref.equipmentNum ?? '869999000000001',
      vehicleTypeId: '2653',
      itemCode: '6KM2-CNE0C4-BM2S',
      vinNo: ref.vin,
      vehicleTypeName: '450SR',
      imageUrl:
        'https://oss-cfmoto.zeehoev.com/uploads/cfmoto-platform/media/vehicle/type/1750930678708.png',
      deviceState: 'ONLINE',
      online: true,
      remainingOil: 3,
      totalOilSegments: 6,
      oilPercent: 50,
      remainingOilDisplay: '充足',
      signalLevel: 28,
      signalText: '强',
      batteryVoltage: 13.3,
      batteryVoltageDisplay: '正常',
      batteryStatus: '正常',
      batteryThreshold: 12,
      totalMileageKm: 9347.5,
      monthMileageKm: 391.9,
      monthDurationSeconds: 52630,
      averageSpeedKph: 26.81,
      location: {
        latitude: 39.908692,
        longitude: 116.397477,
        altitudeMeters: 5,
        reportedAtEpochSeconds: 1792166664
      },
      lastUpdate: '2026/10/17 00:04',
      recentRide: {
        id: 'TEST-RIDE-0001',
        shardingId: 'TEST-SHARD-0001',
        date: '2026-10-16',
        distanceKm: 27.5,
        durationSeconds: 2206,
        maxSpeedKph: 102,
        startTime: '2026-10-16 23:27:26',
        endTime: '2026-10-17 00:04:12',
        startAddress: '北京市东城区天安门广场',
        endAddress: '北京市东城区故宫博物院'
      },
      issues: []
    };
  }

  async getMonthReport(
    ref: VehicleRef,
    month: MonthKey
  ): Promise<MonthRideReport> {
    const today = formatDate(this.clock.now());
    if (monthOf(today) < month) {
      throw new AppError(`${month} 是未来月份`, { code: 'INVALID_INPUT' });
    }
    const dates = enumerateDates(month).filter(date => date <= today);
    const days = dates
      .map((date, index) => {
        const roll = seededValue(month, index);
        // 约 45% 的日期有骑行记录。
        if (roll > 0.45) return null;
        const distanceMeters = Math.round((12 + roll * 180) * 1000);
        const durationSeconds = Math.round((distanceMeters / 1000 / 45) * 3600);
        return {
          date,
          distanceMeters,
          durationSeconds,
          maxSpeedKph: Math.round(60 + roll * 70),
          rapidAcceleration: Math.round(roll * 6),
          rapidDeceleration: Math.round(roll * 4),
          rapidTurn: Math.round(roll * 5)
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const totalKm = days.reduce(
      (sum, day) => sum + day.distanceMeters / 1000,
      0
    );
    return createMonthRideReport({
      month,
      vehicleId: ref.vehicleId,
      deviceId: ref.deviceId,
      firstBindMonth: FIXTURE_FIRST_BIND_MONTH,
      reportedTotalRaw: totalKm.toFixed(1),
      days,
      fetchedAt: this.clock.now().toISOString(),
      source: this.sourceId
    });
  }

  async getMonthlyFuel(
    _ref: VehicleRef,
    month: MonthKey
  ): Promise<MonthlyFuelConsumption> {
    return {
      month,
      firstBindMonth: FIXTURE_FIRST_BIND_MONTH,
      totalLiters: 0,
      totalLitersPrecise: 0,
      days: []
    };
  }

  async getDayStats(ref: VehicleRef, date: DateKey): Promise<DayRideStats> {
    void ref;
    const roll = seededValue(date, 0);
    const stats = createDayRideStats({
      date,
      durationSeconds: Math.round(roll * 7200),
      maxSpeedKph: Math.round(60 + roll * 80),
      monthDistanceRaw: null,
      rapidAcceleration: Math.round(roll * 5),
      rapidDeceleration: Math.round(roll * 3),
      rapidTurn: Math.round(roll * 4)
    });
    if (!stats)
      throw new AppError('假数据源无法生成单日统计', { code: 'UNKNOWN' });
    return stats;
  }

  async listRideHistory(
    _ref: VehicleRef,
    query: RideHistoryQuery
  ): Promise<Paged<RideHistoryItem>> {
    const date = query.from ?? formatDate(this.clock.now());
    const items: RideHistoryItem[] = [
      {
        id: `demo-${date}-morning`,
        shardingId: `demo-${date}-1`,
        date,
        startTime: `${date} 08:10:00`,
        endTime: `${date} 08:52:00`,
        startAddress: '北京市东城区天安门广场',
        endAddress: '北京市东城区故宫博物院',
        distanceKm: 18.6,
        durationSeconds: 2520,
        maxSpeedKph: 68,
        raw: {}
      },
      {
        id: `demo-${date}-evening`,
        shardingId: `demo-${date}-2`,
        date,
        startTime: `${date} 18:20:00`,
        endTime: `${date} 18:58:00`,
        startAddress: '北京市东城区故宫博物院',
        endAddress: '北京市东城区天安门广场',
        distanceKm: 15.2,
        durationSeconds: 2280,
        maxSpeedKph: 61,
        raw: {}
      }
    ];
    return {
      items,
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      total: items.length,
      issues: []
    };
  }

  async getRideHistoryDetail(
    _ref: VehicleRef,
    id: string
  ): Promise<RideHistoryDetail> {
    return {
      id,
      shardingId: 'demo-shard',
      startTime: '2026-10-16 08:10:00',
      endTime: '2026-10-16 08:52:00',
      startAddress: '北京市东城区天安门广场',
      endAddress: '北京市东城区故宫博物院',
      distanceKm: 18.6,
      durationSeconds: 2520,
      maxSpeedKph: 68,
      accelerationTimes: 1,
      brakesTimes: 2,
      bendingTimes: 3,
      trajectory: [
        {
          longitude: 116.397477,
          latitude: 39.908692,
          speedKph: 12,
          cumulativeDistanceKm: 0,
          timestampSeconds: 1792080600
        },
        {
          longitude: 116.397677,
          latitude: 39.908592,
          speedKph: 26,
          cumulativeDistanceKm: 0.8,
          timestampSeconds: 1792080610
        },
        {
          longitude: 116.397977,
          latitude: 39.908392,
          speedKph: 42,
          cumulativeDistanceKm: 1.7,
          timestampSeconds: 1792080620
        },
        {
          longitude: 116.398377,
          latitude: 39.908092,
          speedKph: 58,
          cumulativeDistanceKm: 3.3,
          timestampSeconds: 1792080640
        },
        {
          longitude: 116.398677,
          latitude: 39.907792,
          speedKph: 34,
          cumulativeDistanceKm: 5.4,
          timestampSeconds: 1792080680
        },
        {
          longitude: 116.398977,
          latitude: 39.907492,
          speedKph: 22,
          cumulativeDistanceKm: 7.8,
          timestampSeconds: 1792080720
        }
      ],
      raw: {}
    };
  }
}

export class FixtureAuthDataSource implements AuthDataSource {
  readonly sourceId = 'fixture-auth';
  readonly capabilities: AuthCapabilities = {
    sendVerifyCode: 'unverified',
    loginByVerifyCode: 'unverified',
    loginByPassword: 'unverified',
    checkRegistered: 'unverified',
    checkTicket: 'unverified',
    logout: 'unverified'
  };

  private readonly clock: Clock;

  constructor(options: { clock: Clock }) {
    this.clock = options.clock;
  }

  async sendVerifyCode(phone: string): Promise<void> {
    void phone;
  }

  async loginByVerifyCode(input: LoginByVerifyCodeInput): Promise<AuthSession> {
    if (input.verifyCode.length < 4) {
      throw new AppError('假数据源要求验证码至少 4 位', {
        code: 'INVALID_INPUT'
      });
    }
    return {
      ticket: PREVIEW_TICKET,
      userId: FIXTURE_PROFILE.userId,
      nickname: FIXTURE_PROFILE.nickname,
      isVip: FIXTURE_PROFILE.isVip,
      loginAt: this.clock.now().toISOString()
    };
  }

  async loginByPassword(phone: string, password: string): Promise<AuthSession> {
    void password;
    return this.loginByVerifyCode({ phone, verifyCode: '123456' });
  }

  async getUserProfile(): Promise<UserProfile> {
    return { ...FIXTURE_PROFILE };
  }

  async checkRegistered(): Promise<boolean | null> {
    return null;
  }

  async checkTicket(): Promise<boolean | null> {
    return true;
  }

  async logout(): Promise<void> {}
}
