# 熊崽电竞 App｜预发布联调、构建与回滚手册

更新日期：2026-08-22。本文档只定义开发和预发布流程，不授权创建付费账号、生产数据库/密钥或上传应用市场。

## 1. 本地开发

1. 复制 `apps/mobile/.env.example` 为不纳入 Git 的 `.env.local`。
2. 启动本地 PostgreSQL 与 API，确认 `/health/live` 和 `/health/ready` 返回 200。
3. 启动 Expo Development Build：`pnpm mobile:start`。
4. 不要在 `EXPO_PUBLIC_*` 中放入 Token、渠道密钥或 PII 加密密钥；所有 `EXPO_PUBLIC_*` 都会进入客户端 Bundle。

API 地址：

- iOS Simulator：`http://127.0.0.1:3002/api/v1`
- Android Emulator：`http://10.0.2.2:3002/api/v1`
- 真机：`http://<开发电脑局域网 IP>:3002/api/v1`，手机与电脑必须在同一隔离测试网络，防火墙只放行必要端口。
- 预发布/生产：必须为 `https://`；生产构建在配置阶段会拒绝 HTTP。

## 2. iOS 与 Android 运行

```bash
pnpm mobile:ios
pnpm mobile:android
```

若原生目录尚未生成，先执行 `pnpm --filter @xiongzai/mobile prebuild`。预发布验收必须记录：OS 版本、设备型号、App 构建号、API 环境、执行人和时间。仅 Expo Bundle 导出成功不等于 Xcode/Gradle 原生编译、签名或真机验收成功。

## 3. 环境变量和应用标识

| 变量 | 开发 | 预发布 | 生产 |
|---|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | `development` | `test` | `production` |
| `EXPO_PUBLIC_API_BASE_URL` | 本地 HTTP | 预发布 HTTPS | 生产 HTTPS |
| `EXPO_PUBLIC_ENABLE_MOCK_PAYMENT` | 可显式设 `true` | 仅隔离支付沙箱可设 `true` | 必须为 `false`/未设置，否则构建失败 |
| `IOS_BUNDLE_IDENTIFIER` | 默认 `com.xiongzai.esports.dev` | 必须由签名负责人确认 | 必须显式配置 |
| `ANDROID_APPLICATION_ID` | 默认 `com.xiongzai.esports.dev` | 必须由签名负责人确认 | 必须显式配置 |

仓库里的 `com.example.xiongzai` 只是示例文字，不是已申请的正式标识。正式 Bundle ID/Application ID、Apple Team、Android keystore 和 EAS 凭证必须由授权人员在 CI/Secret Manager 中配置。

## 4. Deep Link、Universal Link 与 App Link

当前已保留自定义 Scheme：`xiongzai://`。外部参数不能直接确定支付成功，所有支付、订单、退款、投诉和通知目标都必须先恢复 Session，再向 API 校验权限与最终状态。

计划路径：

- `xiongzai://orders/<id>`
- `xiongzai://payments/<id>/result?orderId=<id>`
- `xiongzai://refunds/<id>`
- `xiongzai://complaints/<id>`
- `xiongzai://notifications/<id>`

启用 Universal Link/App Link 前必须确认正式域名和运营权，再配置 iOS Associated Domains、`apple-app-site-association`、Android intent filters 和 `assetlinks.json`。当前这些未配置，不得声称已验证。

## 5. 支付回跳和推送规划

- 开发/隔离测试可用后端 Mock Payment Provider，且 App 必须显式配置 `EXPO_PUBLIC_ENABLE_MOCK_PAYMENT=true`。
- 生产构建禁止 Mock Payment Provider；真实支付渠道未接入时收银台会安全禁用创建支付。
- 回跳只用来定位 payment/order ID，回到前台后必须查询服务端。
- 系统推送 SDK、device push token 注册、APNs/FCM 证书、通知权限和消息投递 Worker 尚未接入。当前只有 App 内通知 Cursor API 和安全深链。

## 6. 权限与隐私清单

| 权限/能力 | 当前用途 | 状态 |
|---|---|---|
| 相册 | 用户主动选择头像、陪玩/服务图片和投诉证据 | 仅使用时申请 |
| 相机 | 用户主动拍摄头像 | 仅使用时申请 |
| 麦克风 | 用户主动录制 10–30 秒声音名片 | 仅进入录音功能时申请；也可改选本地音频 |
| 系统通知 | 未接入推送 | 不申请 |
| 定位/联系人/蓝牙 | 无业务用途 | 不申请 |

当前图片与声音流程会读取本地文件、计算 SHA-256、申请短时预签名 PUT、直传隔离 Bucket，再由服务端 complete 校验与进入审核；只有服务端返回的真实 `file_id` 可以绑定。短期预签名 URL 和本地 URI 均不得持久化。该链路已在本地 MinIO 隔离环境验证，但生产对象存储、CDN 和恶意文件扫描尚未接通；身份证等敏感图片不得进入未经明确授权的用途。

## 7. 构建和验证命令

```bash
pnpm mobile:typecheck
pnpm mobile:lint
pnpm mobile:test
pnpm --filter @xiongzai/mobile exec expo-doctor
pnpm --filter @xiongzai/mobile exec expo config --type public
pnpm --filter @xiongzai/mobile exec expo export --platform ios --output-dir /tmp/xiongzai-ios
pnpm --filter @xiongzai/mobile exec expo export --platform android --output-dir /tmp/xiongzai-android
pnpm backend:typecheck
pnpm backend:test
pnpm e2e:test
pnpm test
pnpm lint
git diff --check
```

数据库集成和 E2E 必须使用 `TEST_DATABASE_URL`、独立临时 Schema 和注入 Provider；不得连接生产数据库、发真短信或触发真扣款/打款。

## 8. 构建和回滚

1. 冻结 PRD 矩阵、API 契约、环境变量清单和测试数据版本。
2. 用预发布配置生成可安装的 iOS/Android 构建，保存不含密钥的构建元数据和 checksum。
3. 执行本手册的 12 条人工主链路，记录截图、API request ID 和服务端事实。
4. 发布门禁不通过时，不上传应用市场；回滚到上一个兼容当前 API/Schema 的构建。
5. 客户端回滚不能回滚已发生的订单、支付、退款、提现或账务事实；服务端依靠幂等键、事件号和对账恢复。

## 9. 原生人工验收记录模板

每条必须在 iOS 和 Android 至少各一次，覆盖小屏、大字号和弱网：

1. 首次启动 → 登录 → 资料初始化 → 首页。
2. 强制结束 App 后冷启动恢复，及启动时断网后重试。
3. 搜索 → 服务详情 → 收藏，返回后关键词/排序/滚动位置不变。
4. 服务 → SKU → 预约 → 下单 → Mock 支付 → 订单，重复点击不重复下单。
5. 卖家接单/开始/完成 → 买家确认 → 评价。
6. 部分退款 → 卖家拒绝 → 平台介入。
7. 投诉创建和进度刷新；选择最多 6 张证据，验证私有直传、审核、绑定以及失败恢复。
8. 聊天失败原位重试、历史消息锚点、通知已读和无权深链。
9. 陪玩申请草稿、头像/封面/声音上传审核、状态页和服务发布。
10. 卖家订单接单 → 待开始 → 履约，尝试提前开始必须失败。
11. 收益 → 收款账户 → Mock 提现，账户始终脱敏，重复点击只生成一笔。
12. 撤销当前 Session → 凭证清理 → 重新登录。

视觉记录要求：启动、登录、首页、搜索、服务详情、确认订单、支付四结果、订单全状态、聊天、我的、陪玩中心、收益/提现。对照现有 Web UI 与 PRD，同时检查动态字体、对比度、44pt 触控、键盘、安全区、超长昵称、极大金额和空图。当前仓库锁定浅色模式，不声称支持深色模式。

## 10. 已知发布阻断

### 预发布联调前必须处理

- 准备可安装的 iOS/Android Development/Staging Build 和模拟器/真机。
- 配置隔离预发布 API、测试数据库、测试短信与 Mock 支付/打款 Provider。
- 执行真正原生 UI E2E 和两平台视觉验收；当前只有 Mobile 单元/契约测试和 API E2E。

### 生产发布前必须关闭

- 真实短信、支付、退款、打款渠道和签名/对账演练。
- 生产对象存储 Bucket/IAM/KMS、正式访问域名、CDN、恶意文件扫描和预发布真实联调；当前只有代码、测试适配器与本机 MinIO 隔离链路，不能视为生产存储已接通。
- 数据导出任务、手机号换绑和账号注销服务端能力。
- WebSocket 实时聊天网关或产品批准的轮询容量方案，以及 APNs/FCM 系统推送。
- 正式域名、Universal/App Link、Bundle ID/Application ID、签名、隐私政策声明和应用市场资料。
- 崩溃/错误监控、指标告警、隐私过滤、敏感页截屏/后台快照保护、备份/PITR 和容量压测。
