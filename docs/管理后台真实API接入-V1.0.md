# 熊崽电竞管理后台真实 API 接入 V1.0

## 1. 接入原则

- `/admin` 仅通过 `admin-api/v1` 访问业务数据，不直接访问 PostgreSQL。
- 管理员 Access Token 只保存在 `HttpOnly + SameSite=Strict` Cookie，页面脚本无法读取。
- 管理员密码使用随机盐 `scrypt`；TOTP 密钥使用应用层 AES-256-GCM 密文保存。
- MFA 验证通过不等于获得权限。每个接口仍读取数据库中的角色与权限进行 RBAC 判断。
- 危险操作必须提交业务理由，并在同一业务事务写入 `admin_operation_logs`。
- 用户列表只返回手机号脱敏值；手机号密文、哈希、实名密文、收款账户密文均不进入后台响应。
- 金额继续使用 bigint 分，JSON 响应序列化为十进制字符串。

## 2. 模块、API 与权限矩阵

| 后台模块 | 真实 API | 权限 |
|---|---|---|
| 经营概览 | `GET /governance/dashboard` | `dashboard.read` |
| 登录与会话 | `POST /auth/login`、`POST /auth/mfa/verify`、`GET /auth/session`、`POST /auth/logout` | 登录接口公开；其余需要有效管理员会话 |
| 管理员与 RBAC | `GET /rbac/admins`、`GET /rbac/roles`、`GET /rbac/permissions`、`POST /rbac/roles`、`PATCH /rbac/admins/:id/roles` | `admin.read`、`admin.manage`、`role.read`、`role.manage`；写操作要求 MFA |
| 用户治理 | `GET /users`、`PATCH /users/:id/status` | `user.read`、`user.status.manage`；状态更新要求 MFA、version 和理由 |
| 实名审核 | `GET /identity-verifications`、`POST /identity-verifications/:id/review` | `identity.read`、`identity.review`，要求 MFA |
| 陪玩与服务 | `GET /catalog/sellers`、`GET /catalog/products`、原有审核与状态接口 | `seller.read`、`product.read`、`seller_application.*`、`seller.status.manage`、`product.review` |
| 订单与支付 | `GET /orders`、`GET /orders/:id`、`GET /payments` | `order.read`、`payment.read`；支付查询要求 MFA |
| 退款、投诉、评价 | 原有 `/refunds`、`/complaints`、`/reviews` 管理接口 | 对应 `*.read`、`*.manage`，危险操作要求 MFA 和理由 |
| 客服 | 原有 `/support-cases` 管理接口 | `support.read`、`support.manage`、`support.reply` |
| 聊天取证 | `GET /conversations`、`POST /conversations/:id/evidence-view` | `conversation.evidence.read`；每次取证先写理由审计再返回只读消息 |
| 财务、提现、对账 | 原有 `/finance`、`/withdrawals` 管理接口 | `finance.read/manage`、`withdrawal.read/manage`，全部要求 MFA |
| 风险与安全 | `GET /governance/risk-events`、`POST .../resolve`、`GET /governance/security-logs` | `risk.read/manage`、`security_log.read` |
| 操作审计 | `GET /governance/operation-logs` | `admin_log.read` |
| 平台配置 | `GET /governance/configs`、`POST /governance/configs` | `config.read/manage`；发布要求 MFA 和理由 |
| 全局搜索 | `GET /governance/search?q=` | `global_search.read` |

所有路径均以 `/admin-api/v1` 为前缀。

## 3. 状态、分页与并发

- 用户和订单列表使用带 HMAC 签名的游标，返回 `{ items, next_cursor }`。
- 前端保留原有中文布局，并统一展示加载、空数据、失败、离线和重试状态。
- 用户冻结采用 `id + current_status + version` Compare-And-Set。冻结成功时同事务撤销所有用户会话。
- 风险结案采用 `id + version` Compare-And-Set，避免两位管理员覆盖处理结论。
- 配置发布会锁定同配置键的最新版本，先将旧 ACTIVE 版本置为 RETIRED，再插入新 ACTIVE 版本；数据库部分唯一索引继续保证每个配置键只能有一个生效版本。
- 角色分配整体替换并审计前后角色集合；禁止管理员移除自己的全部角色造成自锁。

## 4. 本地管理员引导

数据库迁移不会创建演示管理员。首次本地使用前，在 Git 忽略的 `.env.backend.local` 临时配置以下变量：

```text
ADMIN_BOOTSTRAP_USERNAME=alex.admin
ADMIN_BOOTSTRAP_DISPLAY_NAME=Alex
ADMIN_BOOTSTRAP_PASSWORD=<至少 12 位的本地强密码>
ADMIN_BOOTSTRAP_TOTP_SECRET=<验证器使用的 Base32 密钥>
```

然后执行：

```bash
pnpm admin:bootstrap
```

脚本拒绝在 `NODE_ENV=production` 运行，不输出密码、TOTP 密钥或数据库连接串，也不会覆盖已存在的管理员。执行完成后应从环境文件删除 `ADMIN_BOOTSTRAP_PASSWORD` 和 `ADMIN_BOOTSTRAP_TOTP_SECRET`。

## 5. 审计与安全验收

- 错误密码累计五次会锁定账号 15 分钟；过期后在下一次正确登录时自动解锁。
- MFA 错误会写 `security_logs`，登录成功、退出也写安全日志。
- 用户冻结、角色创建与分配、风险结案、配置发布、审核、财务操作和聊天取证均有管理员、理由、IP、request_id、trace_id 和时间。
- `admin_operation_logs` 没有更新或删除 API；历史配置没有删除 API。
- API 权限测试验证：即使 Token 标记 `mfa_verified=true`，缺少具体 RBAC 权限仍返回 `ADMIN_PERMISSION_DENIED`。
