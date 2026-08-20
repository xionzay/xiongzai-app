# 熊崽电竞后端 API 基础设施 V1.0

> 身份与用户业务模块已经在后续阶段实现，接口和安全约定见 `docs/身份与用户模块-V1.0.md`。本文的“当前边界”仅描述基础设施阶段当时的范围。

## 1. 范围

本阶段只建立模块化单体的运行基础，不包含订单、支付、退款、聊天、客服、审核或财务业务接口，也不修改现有用户端和管理后台视觉。

运行单元：

- `apps/api`：NestJS + Fastify，承载 `/api/v1`、`/admin-api/v1`、`/internal/v1` 和健康检查。
- `apps/worker`：使用 `FOR UPDATE SKIP LOCKED` 领取 `outbox_events`，通过可替换的 `EventPublisher` 发布。
- `apps/scheduler`：使用 `FOR UPDATE SKIP LOCKED` 领取 `scheduled_jobs`，通过显式注册的幂等 Handler 执行。
- `packages/application`：事务边界以及 Idempotency、Outbox、Inbox、Scheduled Job 公共服务。
- `packages/auth`：用户、管理员和内部服务三套独立 Token 验证及 RBAC 判断。
- `packages/contracts`：统一错误、Cursor、API JSON 序列化。
- `packages/observability`：AsyncLocalStorage 请求上下文与脱敏 JSON 日志。
- `packages/database`：唯一数据库 Schema 和连接实现；其他包禁止重复定义表。

## 2. 配置

参考 `config/backend.env.example`，把真实值放入本机环境或密钥管理系统，不要提交真实连接串或 Token 密钥。

必填：

- `DATABASE_URL`
- `USER_TOKEN_SECRET`、`ADMIN_TOKEN_SECRET`、`INTERNAL_TOKEN_SECRET`、`CURSOR_SIGNING_SECRET`，均至少 32 字节

自动化测试使用 `config/backend.test.env.example` 作为变量清单；其中两个数据库地址必须指向可随时清空的 PostgreSQL 16 测试库，禁止填写生产库。

API 默认监听 `0.0.0.0:3002`。开发环境 Worker 默认使用 `log` 发布适配器，仅用于验证执行链路；生产环境会拒绝此模式，必须接入真实消息队列适配器。

本机验收环境使用 Git 忽略的 `.env.backend.local`，只连接回环地址上的 `xiongzai_api_dev` 和 `xiongzai_database_test`。文件权限必须为 `0600`，不得复制到示例配置或日志。可通过 `pnpm db:local:verify` 复核 PostgreSQL 主版本、表/Enum 数量、扩展、关键约束和受限账号权限。

## 3. 命令

```bash
pnpm backend:typecheck
pnpm backend:build
pnpm backend:test
pnpm api:dev
pnpm worker:dev
pnpm scheduler:dev
```

## 4. HTTP 约定

- `GET /health/live`：进程存活，不访问数据库。
- `GET /health/ready`：执行 `select 1`，数据库不可用时返回 HTTP 503 和 `DATABASE_UNAVAILABLE`。
- 响应头始终包含 `x-request-id`、`x-trace-id`。
- `bigint` 输出十进制字符串，`Date` 输出 UTC ISO 8601。
- 所有异常转换为 `{ code, message, request_id, field_errors, details? }`。
- `@Public()` 可明确标记公开端点；其他路由按基础路径默认选择 user/admin/service 鉴权域。
- 管理接口使用 `@RequirePermissions(...)` 和 `@RequireMfa()` 做权限及二次认证检查。
- DTO 使用 `ZodValidationPipe`，列表参数使用 `@xiongzai/contracts` 的签名 Cursor。

## 5. 可靠性规则

- 业务聚合、状态日志、预约、账务和 Outbox 必须在同一 `UnitOfWork` 中提交。
- 所有外部事件先写 `outbox_events`；业务请求中禁止直接依赖消息队列成功。
- 消费端先通过 `inbox_events` 原子领取；唯一约束保证同一 consumer 不重复处理 event。
- 写接口先用 `IdempotencyService.reserve` 校验请求摘要，完成后保存响应引用。
- 定时任务用稳定 `job_key` 去重，Handler 必须能安全重试。
- Worker/Scheduler 领取使用行锁和 `SKIP LOCKED`，支持多实例竞争。

## 6. 当前边界

真实 PostgreSQL 就绪检查、事务回滚和 Outbox 同事务集成用例依赖 `TEST_DATABASE_URL`。未配置时测试会明确跳过，不会自动连接生产数据库或创建付费资源。
