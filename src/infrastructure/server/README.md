# `infrastructure/server`：未来自建 Server 的接入位置

当前阶段不引入后端服务。这个目录只是**预留的替换点**，用来证明架构可替换：
页面与业务用例只依赖 `RideDataSource` / `RideRepository` 两个契约，
接自建 Server 时只需要在 `src/services/container.ts` 里换掉实现。

## 为什么要自建 Server

直接在小程序里调用春风官方接口有三个现实限制（都来自 `api.yaml` 与小程序平台规则）：

1. **签名密钥无法安全保存在客户端**。`Cfmoto-X-Sign` 需要 `APP_SECRET`，
   打包进小程序等于公开。
2. **历史数据同步成本高**。月报只能按月查询，补齐多年历史需要几十次请求，
   放在服务端可以用数据库缓存并对所有客户端共享。
3. **小程序需要配置 request 合法域名**，且官方接口随时可能变更，
   服务端可以统一做适配与降级。

## 接入清单（尚未实现，均为待确认项）

`ServerRideDataSource` / `ServerRideRepository` 目前所有方法都会抛出 `NOT_IMPLEMENTED` 错误，
因为以下信息都还没有确定，不能凭空定义：

- 服务端 API 的基础路径与版本策略；
- 鉴权方式（自签 token / 微信登录换 token / 复用春风 ticket 透传）；
- 各接口的请求与响应结构（是否直接复用 `MonthRideReport` 等领域模型的 JSON 形态）；
- 错误码约定与限流策略；
- 服务端数据库表结构（月报按 `vehicleId + month` 存储是已经确定的业务约束）。

## 替换方式

```ts
// src/services/container.ts
const rideDataSource: RideDataSource = useServer
  ? new ServerRideDataSource({ baseUrl, authToken, timeoutMs })
  : createCfMotoRideDataSource({ client })
```

`domain`、`application`、`stores`、`pages` 均不需要任何改动。
