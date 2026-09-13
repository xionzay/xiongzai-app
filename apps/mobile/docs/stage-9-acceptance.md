# 熊崽电竞 App｜阶段 9 收口与发布门禁报告

验收日期：2026-08-21；2026-08-22 根据文件存储阶段 3–7 和本次 Mobile 工程修复补充核对。结论仅适用于当前未提交工作区。

## 1. Go / No-Go

- **可以进入有限预发布联调**：Mobile 类型、lint、单元/契约测试、API 集成、PostgreSQL、核心 API E2E、生产 Expo 公开配置和 iOS/Android Bundle 导出已通过。联调必须使用隔离预发布数据库和 Mock Provider。
- **尚不能签署“原生预发布验收通过”**：当前机器没有 Xcode `simctl`、Android `adb` 和 Maestro/Detox 运行证据，因此没有双平台可安装构建、视觉截图和真正原生 UI E2E。
- **不可进入生产发布**：第 4 节 P0 发布阻断尚未关闭。

## 2. 本阶段已完成的收口

- 维护 76 项 `PRD → 路由 → API → 状态 → 测试` 矩阵：68 完成、5 部分、2 阻断、1 按 PRD 不实现业务。文件上传能力已按当前代码和本地集成报告重新核对。
- Mobile 已接入文件策略、图片/声音选择、SHA-256、短时预签名 PUT、complete、本人任务恢复、审核状态、业务绑定和删除；后端已有 S3 兼容/MinIO Provider、服务端内容校验及文件生命周期任务。该结论只代表代码与本地隔离环境，不代表生产对象存储已接通。
- 全局 TanStack Query 接入 AppState 和 NetInfo：前台/恢复联网安全同步读查询；mutation 自动重试仍为关闭。
- 新增全局断网栏和 Toast 基础设施；收藏和隐私设置已使用成功/失败 Toast。
- 冷启动遇到临时网络错误时保留 SecureStore Refresh Token 并允许重试；真实会话失效才清理。
- `USER_DISABLED`/Session 终止时不再尝试刷新，并清理 Token、结账、售后、聊天 outbox 和提现意图。
- 陪玩 Tab 在加载、断网、错误、未登录、未通过和资格暂停时有明确状态。
- 收益明细和提现记录改为服务端签名 Cursor + Mobile `FlatList`；无 query 参数的 Web 调用保留有界数组兼容响应。
- 生产构建强制 HTTPS、禁止 Mock 支付、必须显式配置 Bundle ID/Application ID。未配置真实支付时收银台安全禁用，不暴露模拟按钮。
- 静态安全回归检查 AsyncStorage/localStorage、debug console、WebView 和未校验 `Linking.openURL`，当前 Mobile 生产源码均未发现。

## 3. 自动化与构建结果

| 检查 | 真实结果 |
|---|---|
| Mobile TypeScript | 通过 |
| Mobile lint | 0 错误、0 警告 |
| Mobile 单元/契约 | 本次工程修复后 111 通过、0 失败、0 跳过；原 106 项未减少或跳过 |
| 后端 8 工作区 TypeScript | 全部通过 |
| API 完整回归 | 50 通过、0 失败、0 跳过 |
| 核心 user journey E2E | 1 通过、0 失败；独立临时 Schema |
| Database | 15 通过、0 失败、0 跳过；Drizzle `check` 通过 |
| 其他后端包 | contracts 4、auth 3、observability 1、application 1、worker 2、scheduler 2，全通过 |
| 根项目构建 | 通过，`/` 和 `/admin` |
| 根项目测试 | 21 通过、0 失败 |
| 根项目 lint | 0 错误、72 个原有 Web UI 警告 |
| Expo production public config | 通过；HTTPS、Mock=false、显式 App ID |
| iOS Expo Bundle | 通过；1461 modules，Hermes bundle 3.8 MB |
| Android Expo Bundle | 通过；1591 modules，Hermes bundle 4.1 MB |
| Expo Doctor | 16/21；两个实际环境问题：根目录同时有 pnpm/npm lockfile，当前 Codex runtime 没有 `npm` 可执行文件，后者导致 4 项检查无法运行 |
| Xcode/Gradle 原生编译 | 未执行；机器无 `xcrun simctl`/`adb` |
| 真正 Mobile UI E2E/视觉截图 | 未执行；不伪造结果 |
| `git diff --check` | 通过 |

`pnpm mobile:*` 在当前桌面 runtime 会因 pnpm 企图无 TTY 重建 `node_modules` 而中止；验收改用同一已安装依赖下的 TypeScript、ESLint、Node test、Expo CLI 和 Vinext 直接入口。这不影响上表代码结果，但 CI 必须统一锁文件并正常执行 pnpm scripts。

## 4. 问题分级

### P0：阻断生产

- 未接入和演练真实短信、支付/退款、打款渠道；不允许以 Mock 代替生产。
- 生产对象存储账号/Bucket、IAM/KMS、正式域名、CDN、恶意文件扫描和真实预发布联调未完成；现有本地 MinIO/S3 兼容链路不得表述为生产 OSS 已接通。
- B38 数据导出、B36 手机换绑子能力和 B39 注销任务没有服务端实现。
- 没有经授权的正式 Bundle ID/Application ID、签名凭证、Universal/App Link 域名和应用市场隐私资料。
- 没有双平台原生构建、真机、可访问性、视觉和 12 条 Mobile UI E2E 验收证据。
- 生产 Event Publisher、错误/性能监控、日志隐私过滤、告警、备份/PITR 和恢复演练未完成。

### P1：预发布必须跟踪

- B25 只有真实 HTTP 持久化和前台轮询，无 WebSocket；G10 无 APNs/FCM 系统推送。
- G07 全局 Toast 已建立，但部分旧写操作仍使用页内 banner，需按产品语义继续迁移。
- Expo Doctor 的双 lockfile 需由仓库维护者确认删除旧 `package-lock.json`；本次未自主删除用户已跟踪文件。
- 财务主长列表已分页/虚拟化，但 seller service/refund 等数组 API 在大数据量前仍需加 Cursor 并转为虚拟列表。
- 财务、实名等敏感页尚未增加截屏/后台 app-switcher 快照保护；代码中未使用剪贴板。
- 需在接近生产规模的脱敏数据上执行首屏、列表、聊天轮询、内存、弱网和并发压测。

### P2：不阻断当前联调

- 根 Web UI 保留 72 个 lint warning，主要为 `<img>` 优化和 2 个 Hook 依赖警告；Mobile lint 为 0 warning。
- App 明确锁定浅色模式；深色模式未开发，不展示半套样式。

## 5. 人工验收步骤

1. 在安装有 Xcode/Android SDK 的机器上，生成 Development/Staging Build，记录签名和安装结果。
2. 按 `pre-release-runbook.md` 第 9 节逐条执行 12 条主链路，不使用生产库或付费渠道。
3. 在至少一台小屏 iPhone、一台刘海/灵动岛 iPhone、一台主流 Android 和一台低端 Android 上验收。
4. 系统字号设为最大，验收中文截断、超长昵称、极大金额、空图、屏幕阅读器 label、键盘、44pt 触控和安全区。
5. 分别模拟慢网、断网/恢复、App 切后台、Session 过期、用户禁用、陪玩资格暂停、资源删除和无权深链。
6. 对支付、退款、提现、实名和 Session 页执行截屏/后台快照隐私检查，并确认日志/崩溃事件不含 Token、验证码、完整手机号/证件/收款账号。

本次没有创建 Git commit，也没有发布、上传应用市场、创建生产资源或连接真实付费渠道。
