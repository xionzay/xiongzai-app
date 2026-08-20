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

`db:migrate` 使用 `DATABASE_URL` 执行已提交迁移。`db:test` 总会执行 Schema 合约测试；设置专用 PostgreSQL 16 测试库的 `TEST_DATABASE_URL` 后，还会在随机隔离 Schema 中执行真实迁移集成测试并自动清理。

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
