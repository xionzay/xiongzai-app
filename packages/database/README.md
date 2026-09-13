# @xiongzai/database

熊崽电竞核心 PostgreSQL 16+ 数据库包。它导出 Drizzle 表、relations、枚举、数据库客户端类型与测试工厂，不包含 HTTP API。

## 环境变量

复制下面的变量到本地环境，不要提交真实凭据：

```text
DATABASE_URL=postgresql://app_user:password@localhost:5432/xiongzai
DATABASE_MAX_CONNECTIONS=10
DATABASE_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECTION_TIMEOUT_MS=5000
```

## 命令

从仓库根目录执行：

```bash
pnpm db:generate
pnpm db:check
pnpm --filter @xiongzai/database build
pnpm db:migrate
pnpm db:test
```

`db:migrate` 使用 `DATABASE_URL` 执行已提交迁移。`db:test` 总会执行 Schema 合约测试；设置专用 PostgreSQL 16 测试库的 `TEST_DATABASE_URL` 后，还会在随机隔离 Schema 中执行真实迁移集成测试并自动清理。为防止误连，测试工厂只接受本机地址、数据库名中包含 `test`，且与 `DATABASE_URL` 不是同一个数据库。

## 本地 PostgreSQL 16

当前仓库的本地开发实例保存在 Git 忽略的 `.local/`，开发密钥保存在权限为 `0600` 且被 Git 忽略的 `.env.backend.local`。应用账号为受限角色 `xiongzai_app`，开发库和测试库相互独立。

实例已启动时，可从仓库根目录重复执行安全的账号/数据库配置并核验结构：

```bash
pnpm db:local:setup
pnpm db:local:verify
```

需要让其他数据库命令读取本地配置时，先在当前终端载入变量；该命令不会打印变量值：

```bash
set -a
source .env.backend.local
set +a
pnpm db:migrate
pnpm db:test
```

禁止把 `.env.backend.local`、`.local/postgres-data/` 或任何完整连接串提交到 Git。

金额字段在 TypeScript 中保持 `bigint`。调用方不得转换成 `number`，对外使用整数分或十进制字符串。

当前完整结构为 70 张表、68 个 PostgreSQL Enum、9 个迁移。手机号换绑使用 `phone_change_requests` 关联旧/新两条一次性 `sms_codes` 证明，只保存密文、HMAC 哈希和脱敏值；个人数据导出使用 `personal_data_export_jobs` 关联 `DATA_EXPORT` 文件，不保存预签名 URL；账号注销使用 `account_cancellation_requests` 复用 `scheduled_jobs`、Outbox 和管理员操作审计。三类请求都要求每次更新将 `version` 精确递增 1，并由部分唯一索引阻止同一用户并发创建活动任务。

投诉补充证据继续复用 `complaint_evidences`，不另建表。每条证据只能由用户或管理员一方提交，必须关联已校验的 `COMPLAINT_EVIDENCE` 文件，同一投诉最多 20 条；证据记录只可追加，禁止覆盖或删除。

支付渠道由数据库枚举限定为 `WECHAT_APP`、`ALIPAY_APP`、`MOCK`；收款账户类型只允许 `WECHAT`、`ALIPAY`，不支持银行卡。`MOCK` 仅用于本地或测试环境，真实渠道是否可用由 API 配置控制。

声音名片使用 `files.file_type = VOICE_SAMPLE` 和 `file_usages.usage_type = VOICE` 绑定。数据库要求 MIME 为 `audio/aac`、`audio/mp4` 或 `audio/mpeg`；文件进入 `VERIFIED` 后时长必须为 10–30 秒。审核状态、解绑以及 `deleted_at` 软删除生命周期均保留。

协议使用不可变 `policy_versions` 保存类型、标题、正文、版本、`DRAFT/PUBLISHED/RETIRED`、发布时间、生效时间和重新同意标记。`user_policy_acceptances` 只追加保存用户、协议版本、接受场景、在线确认方式、接受时间及最小请求证明；只允许接受已发布且已生效版本。陪玩申请、声音名片和订单分别可以固定其入驻授权、公开试听授权以及交易/退款规则版本，避免后续协议更新覆盖历史事实。

本地协议草案与正常、待审核、驳回、失败状态样例可重复执行：

```bash
pnpm policy:local:seed
```

该 Seed 强制只写入回环地址上的 `xiongzai_api_dev`，所有文案均标识为“本地测试草案｜未经正式法律审核”，不产生电子签、真实实名、真实支付或真实资金记录。
