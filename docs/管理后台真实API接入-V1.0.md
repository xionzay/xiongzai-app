# 熊崽电竞管理后台真实 API 接入 V1.0

## 1. 接入原则

- `/admin` 仅通过 `admin-api/v1` 访问业务数据，不直接访问 PostgreSQL。
- 管理员 Access Token 只保存在 `HttpOnly + SameSite=Strict` Cookie，页面脚本无法读取。
- 管理员密码使用随机盐 `scrypt`；TOTP 密钥使用应用层 AES-256-GCM 密文保存。
- MFA 验证通过不等于获得权限。每个接口仍读取数据库中的角色与权限进行 RBAC 判断。
- 危险操作必须提交业务理由，并在同一业务事务写入 `admin_operation_logs`。
- 用户列表只返回手机号脱敏值；手机号密文、哈希、实名密文、收款账户密文均不进入后台响应。
- 金额继续使用 bigint 分，JSON 响应序列化为十进制字符串。
- 生产入口不包含演示数据回退。接口空数组显示空状态，失败显示错误或离线状态和重试入口。
- 当前没有启用 Demo 模式；测试与生产环境均不会自动注入业务记录。

## 2. 模块、API 与权限矩阵

| 后台模块 | 真实 API | 权限 |
|---|---|---|
| 经营概览 | `GET /governance/dashboard`、`GET /governance/dashboard/trends?from=&to=&granularity=day` | `dashboard.read`；趋势最长 90 个 UTC 自然日 |
| 实时待办、导航角标 | `GET /todos` | `dashboard.read`；响应再按当前管理员的业务读取权限裁剪 |
| 安全健康状态 | `GET /system/health` | `system_health.read` + MFA；只返回归一化组件状态与检查时间 |
| 登录与会话 | `POST /auth/login`、`POST /auth/mfa/verify`、`GET /auth/session`、`POST /auth/logout` | 登录接口公开；其余需要有效管理员会话 |
| 管理员与 RBAC | `GET /rbac/admins`、`GET /rbac/admins/:id`、`GET /rbac/roles`、`GET /rbac/roles/:id`、`GET /rbac/permissions`、`POST /rbac/roles`、`PATCH /rbac/admins/:id/roles` | `admin.read`、`admin.manage`、`role.read`、`role.manage`；写操作要求 MFA |
| 用户治理 | `GET /users`、`GET /users/:id`、`PATCH /users/:id/status` | `user.read`、`user.status.manage`；状态更新要求 MFA、version 和理由 |
| 用户生命周期监控 | `GET /phone-change-requests`、`GET /phone-change-requests/:id`、`GET /data-export-jobs`、`GET /data-export-jobs/:id`、现有账号注销列表与详情 | `user.read`；换绑和导出为只读，不提供改手机号或下载用户副本入口 |
| 站内通知监控 | `GET /notification-deliveries`、`GET /notification-deliveries/:id` | `user.read`；只读展示站内投递和已读事实，不伪造外部推送状态 |
| 实名审核 | `GET /identity-verifications`、`POST /identity-verifications/:id/review` | `identity.read`、`identity.review`，要求 MFA |
| 陪玩与服务 | `GET /seller-applications`、`GET /seller-applications/:id`、`GET /sellers/:id`、`GET /catalog/sellers`、`GET /product-reviews`、`GET /products/:id`、`GET /catalog/products`、原有审核与状态接口 | `seller.read`、`product.read`、`seller_application.*`、`seller.status.manage`、`product.review` |
| 订单与支付 | `GET /orders`、`GET /orders/:id`、`GET /payments` | `order.read`、`payment.read`；支付查询要求 MFA |
| 退款、投诉、评价 | `/refunds`、`/complaints`、`/reviews` 列表与 `/:id` 真实详情接口 | 对应 `*.read`、`*.manage`，危险操作要求 MFA 和理由 |
| 客服 | 原有 `/support-cases` 管理接口 | `support.read`、`support.manage`、`support.reply` |
| 聊天取证 | `GET /conversations`、`POST /conversations/:id/evidence-view` | `conversation.evidence.read`；每次取证先写理由审计再返回只读消息 |
| 财务、提现、对账 | 原有 `/finance`、`/withdrawals` 管理接口；`GET /withdrawals/:id` 返回脱敏收款账户详情；`POST /withdrawals/:id/approve` 批准；`POST /withdrawals/:id/reject` 驳回并事务释放锁定收益 | `finance.read/manage`、`withdrawal.read/manage`，全部要求 MFA |
| 风险与安全 | `GET /governance/risk-events`、`GET /governance/risk-events/:id`、`POST .../resolve`、`GET /governance/security-logs`、`GET /governance/security-logs/:id` | `risk.read/manage`、`security_log.read` |
| 操作审计 | `GET /governance/operation-logs`、`GET /governance/operation-logs/:id` | `admin_log.read` |
| 平台配置 | `GET /governance/configs`、`POST /governance/configs` | `config.read/manage`；发布要求 MFA 和理由 |
| 全局搜索 | `GET /governance/search?q=` | `global_search.read` |

所有路径均以 `/admin-api/v1` 为前缀。

## 3. 状态、分页与并发

- 用户、陪玩申请、陪玩、服务审核、服务、订单、退款、投诉、客服、聊天取证、评价、账务、对账、提现、文件、风险、安全日志、操作日志、管理员和角色列表统一使用带 HMAC 签名的游标，返回 `{ items, next_cursor }`。
- 后台列表默认每页 20 条、最大 100 条。通用排序为 `created_desc` 或 `created_asc`；游标绑定接口、筛选、排序和作用域，跨筛选或跨模块复用返回 `400 VALIDATION_FAILED`。
- 搜索、状态筛选和排序在服务端数据库查询中执行；前端不会先拉取固定 100 条再本地过滤。加载下一页失败时保留已经成功取得的记录并提供重试。
- 全局搜索是独立的受限聚合查询，每种业务类型最多返回 5 条，不使用列表分页接口。
- 前端保留原有中文布局，并统一展示加载、空数据、失败、离线和重试状态。
- 用户冻结采用 `id + current_status + version` Compare-And-Set。冻结成功时同事务撤销所有用户会话。
- 风险结案采用 `id + version` Compare-And-Set，避免两位管理员覆盖处理结论。
- 配置发布会锁定同配置键的最新版本，先将旧 ACTIVE 版本置为 RETIRED，再插入新 ACTIVE 版本；数据库部分唯一索引继续保证每个配置键只能有一个生效版本。
- 角色分配整体替换并审计前后角色集合；禁止管理员移除自己的全部角色造成自锁。

### 3.1 统一前端错误语义

- `401`：共享请求层发出会话失效事件，页面清理当前管理员身份并回到登录状态。
- `403`：保留服务端安全消息，页面显示缺少权限或未完成 MFA，不把响应伪装为空列表。
- `409`：危险操作不显示成功，先刷新对应服务端记录，再提示版本冲突。
- `400/422`：展示服务端给出的安全表单错误，不拼接请求头、Cookie 或本地配置。
- `5xx`：展示系统错误；只有响应头或响应体确实提供 request ID 时才显示请求编号。
- 网络异常：区分浏览器离线和管理服务不可用，清空当前列表并提供重试，不回退演示数据。

### 3.2 真实统计字段

`GET /governance/dashboard` 返回累计实付交易额、订单数、用户数，以及各业务表当前待处理数量。`GET /todos` 将非零数量转换为实时待办，并根据当前管理员权限只返回可进入模块的项目：

- `pending_seller_reviews`
- `pending_product_reviews`
- `active_refunds`
- `active_complaints`
- `waiting_support_cases`
- `pending_withdrawals`
- `pending_files`
- `open_risk_events`
- `open_security_events`

导航角标和通知入口只使用 `/todos` 成功响应中的非零数量；未取得真实待办时不显示数字。待办当前是实时计算结果，不伪造已读、未读或历史通知语义。

`GET /system/health` 仅向具备 `system_health.read` 的 MFA 管理员返回安全状态、检查时间以及 PostgreSQL 中 Outbox/定时任务的待处理、处理中、失败和最近完成事实。接口明确把独立 Worker/Scheduler 进程存活标记为“未测量”，不会根据队列为空推断进程在线；同时不返回数据库地址、连接串、主机名、端口、Bucket、对象键或 Secret。请求失败时页面显示失败/离线状态，不显示固定的“系统运行正常”。迁移 `0002_admin_stage2_permissions.sql` 只登记该权限，不自动扩大现有角色权限。

`GET /governance/dashboard/trends` 仅在管理员选择 `from`、`to` 并点击查询后调用。按 UTC 日返回真实新增用户、陪玩、服务、订单、支付、完成、退款、投诉、客服、提现和平台费聚合；金额继续使用分字符串。因为当前只保存最近活跃时间，接口明确把无法可靠重建的历史 `active_users` 放入 `omitted_metrics`，不填充假值。

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

## 6. 第二阶段真实详情与大数据量治理结论

- `/admin` 的列表、详情、统计、搜索、日志和写操作统一复用 `app/admin/admin-api.ts`。
- 登录继续使用 HttpOnly Cookie 与 `credentials: include`，页面不保存访问 Token。
- 菜单按读取权限生成；无读取权限的模块不会挂载，因此不会发出不必要的业务请求。
- 管理按钮按 `*.manage`、`*.review`、`*.reply` 等权限显示；后端 RBAC 仍是最终安全边界。
- 用户、陪玩申请、陪玩、服务、评价、风险、安全日志、操作日志、管理员和角色已使用独立真实详情接口；订单、退款、投诉、客服、账务、对账、提现和文件继续使用原有独立详情接口。
- 详情抽屉每次打开都会清空旧详情并发起新请求；切换或关闭会中止旧请求。`404`、`403`、网络错误和重试分别展示，不把列表行当详情，也不会在新请求期间显示上一条记录。
- 经营趋势只接受管理员手动选择的真实日期范围，不自动加载固定 7 天或 30 天数据。
- `/admin?module=...` 保存当前可安全恢复的模块状态；只有当前管理员有读取权限时才恢复该模块。服务端排序、状态、页签、文件状态与趋势日期等枚举/日期筛选使用白名单参数恢复；自由文本搜索不写入 URL，避免把手机号、实名、理由、预签名 URL 或其他敏感查询带入地址栏。
- 文件模块使用真实游标分页；文件审核日志通过 `target_id` 在服务端过滤，不再读取整张操作日志后在浏览器筛选。
- 当前没有伪造通知已读/未读状态；平台配置历史仍为低数据量的版本记录接口，全局搜索仍为受限聚合接口，这两者不伪装成通用分页列表。

这些限制不会用静态数组、固定 JSON、固定数量或固定状态代替。

## 6.1 第五阶段部署安全边界

- `DEPLOYMENT_ENV=staging|production` 时 API 拒绝 development SMS、Mock Payment、Mock Payout、禁用对象存储、缺失/示例 Secret、回环数据库、HTTP/回环 CORS、缺失或全网可信代理，以及 HTTP/回环对象存储 Endpoint。错误只列配置键名。
- API 只信任 `API_TRUSTED_PROXY_CIDRS` 中的代理。生产代理必须覆盖客户端传入的 `X-Forwarded-For`；不可信来源不能把该头伪造成管理员审计 IP。
- staging/production 的管理员及用户 Cookie 均追加 `Secure`，继续保留 `HttpOnly + SameSite=Strict`。所有 `/admin-api/v1/*` 响应强制 `Cache-Control: no-store` 和 `Pragma: no-cache`。
- Fastify 请求体上限由 `API_BODY_LIMIT_BYTES` 控制，默认 1 MiB；反向代理必须配置相同或更小的 JSON 请求体上限。文件字节不经过管理员 JSON API 上传。
- `/health/live` 只表示进程存活；`/health/ready` 最小检查数据库，并在配置对象存储时执行只读、限量列表检查。检查失败返回真实非就绪状态，不能固定显示“系统正常”，也不返回连接地址、Bucket 或对象键。
- Scheduler 和 Outbox Worker 在 staging/production 同样拒绝回环数据库；Worker 还拒绝日志型 EventPublisher。当前真实事件发布、短信、支付和打款适配器尚未接入独立进程入口，因此实际测试服务器仍需这些 Provider 与授权，不能以 Mock 启动受保护环境。

## 7. 第三阶段浏览器 E2E

根命令 `pnpm admin:e2e` 先构建后端及其工作区依赖，再用 Playwright 的本机 Chrome 打开真实 `http://127.0.0.1:3001/admin`。全局初始化只连接 `.env.backend.local` 指向的本地 PostgreSQL 与 `.env.minio.local` 指向的本地 MinIO，并执行以下隔离：

- 每次运行创建随机临时 Schema，依次执行 `0000`、`0001`、`0002`、`0003` 迁移；管理员、角色、用户和业务 ID 全部随机生成，不读取或覆盖开发业务记录。
- 管理员密码、TOTP 密钥、Cookie 加密材料和 API 端口只存在于当前测试进程环境，不硬编码、不打印、不写截图或 Trace。
- API 监听随机回环端口；浏览器仍只访问真实 `/admin` 页面，共享请求层发出的 `/admin-api/v1` 请求由测试上下文转发到该隔离 API。
- 文件用例只向本地 MinIO 写入一个带唯一键的合成 PNG，结束时精确删除该对象并删除临时 Schema。初始化中途失败也执行同一清理，不删除未知对象或开发 Schema。
- `test-results/`、`playwright-report/`、`blob-report/` 和 `playwright/.auth/` 已加入 Git 忽略。为避免随机管理员身份或 TOTP 进入产物，当前默认关闭截图、视频与 Trace；排障时只能使用测试生成的临时身份。

测试报告明确区分两类浏览器用例：

- `[real backend E2E]`：真实密码与 TOTP、HttpOnly Cookie Session、RBAC、签名游标、服务端正倒序、真实详情、用户禁用及原因审计、待办、健康检查、趋势、本地 MinIO 文件预览/审核，以及陪玩/服务审核、退款、投诉、客服、提现、风险结案和配置发布的真实本地闭环。
- `[browser mock errors]`：仅用浏览器请求拦截稳定构造空数据、5xx/request ID、离线、加载更多失败、详情 403/404、409 刷新、延迟写响应及健康检查失败。它们验证页面状态机，不被描述为真实后端成功链路。

SSR/源码契约测试仍由 `node --test tests/admin-ui.test.mjs` 执行，只验证服务端渲染和源码约束，也不被描述为浏览器 E2E。第四阶段浏览器套件为 10 个串行场景，其中 8 个使用真实本地后端、2 个使用浏览器请求拦截验证错误状态；一次完整本地运行结果为 10/10 通过。测试结束会精确删除本次文件对象、删除随机 Schema，并再次断言 Schema 不存在；不会扫描或删除未知开发对象。

## 8. 服务端排序、游标与查询性能

- 高数据量列表继续在 PostgreSQL 执行筛选与排序，游标条件与排序方向一致，并以唯一 `id` 作为稳定次序的最后一列；游标仍由 HMAC 签名且绑定模块、筛选、排序和作用域。
- 服务层没有把整张列表下载后再过滤，也没有回退 OFFSET。列表需要的管理员/角色等关联信息使用有界批量查询，不按每行发起查询；经营趋势继续在数据库按日聚合，金额字段保持 bigint/分字符串。
- 查询计划审计在随机本地 Schema 中为每个目标表构造 15,000 条合成记录。它不是生产压测，也不能外推生产提升比例。
- 新迁移 `0003_admin_query_performance.sql` 只增加五个被目标计划实际采用的复合索引：`users(status, created_at, id)`、未删除 `files(created_at, id)` 部分索引、`admin_operation_logs(created_at, id)`、`risk_events(status, created_at, id)`、`security_logs(status, created_at, id)`。
- 最终本地 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 中，用户、文件、操作日志、风险和安全日志目标查询在迁移后均选择新索引的 Index Only Scan；该次合成环境执行时间分别由 0.616/1.051/1.586/1.204/0.010 ms 变为 0.014/0.010/0.010/0.011/0.006 ms。该数字只用于证明计划命中新索引。
- 五个索引在该 15,000 行合成数据集中的大小约为 608/704/608/744/744 KiB。它们会增加对应表的写入与 VACUUM 成本，因此没有为所有筛选字段批量增加单列索引；其他列表保留现有索引，待生产等价数据分布和慢查询证据出现后再调整。

## 9. 本地验收边界

本阶段没有连接外部数据库、云对象存储或生产 Secret，也没有执行生产部署。上线前仍需在脱敏的生产等价数据量上重新采集计划、验证 autovacuum 与索引膨胀、执行并发/长稳态浏览器回归、验证反向代理对 Cookie/Range/响应头的保持，并完成真实身份系统和对象存储供应商的安全验收。

## 10. 第四阶段预发布质量门禁

- `pnpm admin:quality` 是严格串行的本地门禁，先检查所需配置键、本机回环 PostgreSQL/MinIO 可达性和 Google Chrome，再依次执行生产构建、根/工作区 TypeScript、后端构建、管理员 SSR、真实浏览器 E2E、治理/财务/商家商品/售后/客服/文件/性能集成、定向 ESLint 与 `git diff --check`。
- 缺少配置时只输出变量名，不输出值；数据库或对象存储地址不是回环地址时直接拒绝。任一步骤非零立即停止并使整体退出非零，环境不足不会通过测试的 `skip` 伪装为成功。
- 提现驳回只允许 `CREATED + version`，事务内创建平衡的 `WITHDRAWAL_RELEASE` 账务、恢复收入分配、更新 `REJECTED`、写提现日志、管理员审计和 Outbox；不会调用 Payout Provider。批准/驳回并发由行锁和版本控制保证只有一个终态。
- 危险操作浏览器测试验证：低权限按钮隐藏且手工写请求为 403；未完成 TOTP 时没有管理员业务 Session；提交中按钮禁用；服务端响应前没有成功提示；陈旧版本返回 409 并刷新；操作原因可从真实审计读取。
- 详细命令、失败语义和上线前人工清单见 `docs/管理员后台预发布质量门禁-V1.0.md`。

## 11. 权限与财务整改契约（2026-10-12）

- `GET /rbac/admins/:id` 的 `roles` 提供 `{ id, key, name }`，并返回管理员现有 `version`。角色编辑必须读取独立详情，不能用不完整列表猜测角色 ID。
- `PATCH /rbac/admins/:id/roles` 必须携带 `{ role_ids, version, reason }`；版本缺失为 400，陈旧版本为 `RESOURCE_VERSION_CONFLICT` / 409。清空其他管理员角色还需显式 `confirm_empty_roles: true`；不能清空自己全部角色或移除系统最后一个可用超级管理员。
- 角色分配在事务中复用 `admin_accounts.version` 并递增，不新增迁移；审计记录前后角色集合及版本。超级管理员角色锁先于账号锁，避免两个独立移除同时通过。失败、旧版本及重复旧请求不产生成功审计。
- 角色游标在 SQL 排序、谓词和响应中统一到毫秒，并以 ID 打破同时间排序，修复 PostgreSQL 微秒与 JS Date 毫秒不一致造成的分页遗漏。前端遍历所有页，任一页失败不发布部分选项，不允许保存。
- `POST /finance/exports` 同时要求 `finance.read` **和** `finance.export`，并保留 MFA、原因、导出上限与审计。前端按钮也执行双权限判断。无权限请求在守卫处结束，不进入导出查询或成功审计。
- CSV 金额使用 bigint 转换人民币元；对公式前缀（含前导空白、控制符）添加文本前缀并正确转义引号、逗号和换行。不导出个人账户或身份敏感字段。
- 财务成功支付集合包含 `PAID`、`REFUNDING`、`PARTIALLY_REFUNDED`、`REFUNDED`。GMV 使用成功支付原额，实收减去已成功退款累计额，申请/处理中不提前扣减。支付指标及明细按支付创建日期、渠道、支付状态筛选；收益/提现指标仍按自身创建日期，不随支付渠道/状态筛选变化，响应 `scope` 与页面明确说明。
- 总览已有 GMV 使用订单实付快照、退款使用完成记录，不存在相同 `REFUNDING` 集合遗漏；本轮用真实退款回调与总览/财务读取共同验证，没有重写账务或退款状态机。

### 2026-10-31 售后案件补充

现有案件模块补齐特殊人工受理、独立证据隐私确认及真实文件预览入口。MFA、refund.read/manage、file.read/review、主管权限、初判/复核分离和操作原因保持服务端校验。本轮不自动授予主管。未知退款只续查，明确失败才按能力 RETRY_REFUND，资金不足整笔待执行。详见 [三端联调报告](三端售后案件与评价图片联调及安全同步-2026-10-31.md)。
