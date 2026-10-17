# 春序风物

uni-app + Vue 3 + TypeScript 的春风摩托个人骑行数据应用。调用春风官方接口获取用户、车辆、车辆状态与骑行月报，
并在此基础上提供骑行总览、月报、年报、历史总报告、历史月报同步与车辆信息查看。

## 快速开始

```bash
npm install

# 配置签名密钥（api.yaml 未提供 APP_SECRET，见 docs/api-notes.md 待确认项 1）
copy .env.example .env.local     # 然后填入 VITE_CFMOTO_APP_SECRET

npm run dev:mp-weixin            # 微信小程序，产物在 dist/dev/mp-weixin
npm run dev:h5                   # H5 预览

npm run type-check               # vue-tsc 严格类型检查
npm test                         # vitest 单元测试
npm run build:mp-weixin          # 小程序构建
```

## 快速预览

在登录页切换到「密码登录」，使用用户名 `test`、密码 `test`。
该账号只把 ticket 会话写入本地；车辆、月报、加油记录等业务数据由内置 fixture 提供，
并缓存在进程内存中，不会读取或覆盖真实账号的本地存储。

## 目录结构与职责

```
src/
├─ core/                        # 与 uni-app / Vue 无关，可直接复用到 Web
│  ├─ domain/                   # 业务模型、数据校验、统计计算（纯 TypeScript）
│  │  ├─ identifiers.ts         # MonthKey / DateKey / VehicleRef（三个车辆标识的区别写在这里）
│  │  ├─ models.ts              # 车辆、月报、单日记录等业务模型
│  │  ├─ validation.ts          # 官方 DTO → 领域模型的校验与归一化
│  │  ├─ enrichment.ts          # 用单日统计补齐急加速/急减速/急转弯
│  │  └─ statistics/            # 月报聚合、月/年/历史三套统计
│  ├─ contracts/                # 数据源、仓储、会话、HTTP、时钟接口
│  ├─ application/              # 用例：登录、车辆、报告查询、历史同步
│  └─ shared/logger.ts          # 脱敏日志
├─ infrastructure/
│  ├─ cfmoto/                   # 春风官方 API 实现（签名、DTO、映射、数据源）
│  ├─ storage/                  # uni-app 本地存储实现
│  ├─ http/                     # uni.request 封装
│  ├─ fixture/                  # 仅用于本地预览的假数据源
│  └─ server/                   # 未来自建 Server 的接入位置（当前抛 NOT_IMPLEMENTED）
├─ services/container.ts        # 唯一的依赖装配点
├─ stores/                      # 轻量响应式 store：auth / vehicle / report / sync
├─ components/                  # 统计卡片、图表占位、状态占位等可替换组件
├─ pages/                       # login / overview / report / archive / vehicle
└─ utils/                       # 展示格式化、跳转、事件读取
tests/                          # 111 个单元/集成测试
docs/api-notes.md               # 接口实现说明与待确认项
```

## 关键设计

### 数据源可替换

业务代码只依赖 `RideDataSource`（`src/core/contracts/RideDataSource.ts`）。
当前实现是 `CfMotoRideDataSource`（直连官方接口），
未来新增 `ServerDataSource` 调用自建 Server 时，只需改 `services/container.ts` 中的一行装配。
`infrastructure/server/` 已经预留了接入位置并固定了契约形状，接入清单见该目录的 README。

### 存储可替换

业务代码只依赖 `RideRepository`，当前实现 `UniRideRepository` 使用 uni-app 本地存储，
按**车辆 + 月份**分别缓存月报（键：`cfmoto:v1:month:<vehicleId>:<yyyy-MM>`）。
页面从不直接调用 `uni.setStorageSync`。

### 统计只依赖月报

- 月报是唯一的基础数据，缓存在本地；
- 年报与历史总报告都由 `aggregateMonths` 聚合月报得到，没有第二份统计口径；
- 统计模块全部是纯函数（`src/core/domain/statistics/`），不依赖 uni-app、Vue 或具体数据源，
  时间通过注入的 `Clock` 获取，因此"当前月未结束"这类场景可以直接测试。

### 未知数据不等于 0

缺失的字段一律是 `null`；完全没有已知值时合计是 `null`。
月份被区分为"已覆盖/已知无骑行/尚未同步"三种状态，只有第二种按 0 计入合计。
异常数值会被排除并生成问题记录，页面用状态组件提示。

## 已实现的界面

| 页面 | 内容 |
| --- | --- |
| 登录 | 短信验证码登录（主）、密码登录（次，接口未实测会给出提示）、倒计时、错误状态 |
| 骑行总览 | 当前月统计、历史累计、近半年趋势占位、车辆切换、数据质量提示 |
| 报告 | 月度（月份选择器）、年度、自定义月份区间；每日/每月图表、单日记录、均速/极速、急加速/急刹车/压弯 |
| 历史档案 | 历史总报告、近 6 个月里程、最近月份摘要、同步计划、补齐缺失/重试失败/重新同步、进度条、失败清单 |
| 车辆 | 官方车型图、实时油量/信号/电压/位置、最近行程、月度油耗、车辆列表与切换、点按查看完整 VIN/T-Box/IMEI |
| 油耗与加油记录 | 官方月耗、手动加油记录、省份最近油价查询、金额换算油量、JSON 导入导出、同时间覆盖 |
| 骑行记录详情 | 按日行程列表、轨迹地图、时长/里程/极速/均速和安全事件统计 |

加载中 / 加载失败 / 空数据 / 数据不完整四种状态由 `StatePanel` 统一表达；
统计卡片 `StatCard`、趋势图 `TrendChartPlaceholder` 都是可替换组件
（趋势图当前用柱高表达相对大小，`null` 画成灰色占位）。

## 验证结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 严格类型检查 | `npm run type-check` | 通过（`strict` + `noUncheckedIndexedAccess` 等） |
| 单元测试 | `npm test` | 17 个文件 / 111 个测试全部通过 |
| 小程序构建 | `npm run build:mp-weixin` | 通过（产物 `dist/build/mp-weixin`） |
| H5 构建 | `npm run build:h5` | 通过（产物 `dist/build/h5`） |

测试重点覆盖：签名哈希（对照 RFC 与 Node `crypto`）、签名请求头、标识符用法、
月/年/历史统计（含缺失月份、未结束月份、异常数值）、同步失败保留缓存、
本地存储按车辆+月份隔离、日志脱敏，以及一条不依赖 uni-app 的端到端串联测试
（登录 → 车辆 → 月报/年报/历史总报告/自定义区间 → 历史同步）。

## GitHub Pages 预览

仓库包含 `.github/workflows/deploy-pages.yml`。在 GitHub 仓库的
`Settings → Pages` 中把发布来源设为 **GitHub Actions**，之后推送 `main` 或
`master` 即会自动：

1. 安装依赖并执行 TypeScript 检查；
2. 按当前仓库的 Pages 子路径构建 H5；
3. 在 `index.html` 的模块 JS 之前写入 `ticket=test`；
4. 上传并发布 `dist/build/h5` 到 GitHub Pages。

访问 Pages 地址时会直接进入内置 Mock 数据预览，不需要登录。

## 已知限制

1. **`APP_SECRET` 只放在本地 `.env.local`**，未配置时请求会以 `CONFIG` 错误快速失败。
2. 微信小程序需要在后台把 `https://c.cfmoto.com` 加入 request 合法域名，否则请求会被拦截
   （错误提示里会说明这一点）。
