import type { RideDataSource } from '../contracts/RideDataSource'
import type { DateKey, VehicleRef } from '../domain/identifiers'
import type { Paged, RideHistoryDetail, RideHistoryItem } from '../domain/models'
import { createLogger, silentLogger, type Logger } from '../shared/logger'
import { toAppError } from './errors'
import { errorResult, okResult, partialResult, type DataResult } from './results'

export interface RideHistoryServiceDeps {
  readonly dataSource: RideDataSource
  readonly logger?: Logger
}

export class RideHistoryService {
  private readonly deps: RideHistoryServiceDeps
  private readonly logger: Logger

  constructor(deps: RideHistoryServiceDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
  }

  async listDayTrips(
    ref: VehicleRef,
    date: DateKey,
  ): Promise<DataResult<Paged<RideHistoryItem>>> {
    try {
      const result = await this.deps.dataSource.listRideHistory(ref, {
        from: date,
        to: date,
        pageNumber: 1,
        pageSize: 50,
      })
      return result.issues.length > 0 ? partialResult(result, { issues: [...result.issues] }) : okResult(result)
    } catch (error) {
      const appError = toAppError(error)
      this.logger.warn('获取单日行程列表失败', { date, code: appError.code })
      return errorResult(appError)
    }
  }

  async getDetail(ref: VehicleRef, id: string): Promise<DataResult<RideHistoryDetail>> {
    try {
      return okResult(await this.deps.dataSource.getRideHistoryDetail(ref, id))
    } catch (error) {
      const appError = toAppError(error)
      this.logger.warn('获取行程详情失败', { id, code: appError.code })
      return errorResult(appError)
    }
  }
}

export function createRideHistoryService(deps: RideHistoryServiceDeps): RideHistoryService {
  return new RideHistoryService({ ...deps, logger: deps.logger ?? createLogger({ scope: 'ride-history' }) })
}
