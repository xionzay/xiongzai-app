# 熊崽电竞 App｜PRD 路由、API 与测试追踪矩阵

更新日期：2026-08-22。本矩阵以当前仓库源码和真实 API 为准，不把占位、本地预览或外部能力缺失标记为“已完成”。

状态口径：

- `已完成`：路由、真实 API、主要远程状态和自动化测试均存在。
- `部分完成`：主体可用，但实时网关、上传、推送或子能力被阻断。
- `被阻断`：只有明确的安全降级页，没有伪造成功。
- `不在首期业务范围`：PRD 明确要求占位，不实现假业务。

当前合计：`68 已完成 / 5 部分完成 / 2 被阻断 / 1 不在首期业务范围`。

## 买家端 B01–B47

| PRD | React Native 路由/实现 | 主要真实 API | 状态覆盖 | 自动化证据 | 结论 |
|---|---|---|---|---|---|
| B01 启动页 | `/` / `SplashScreen` | refresh、`GET /me` | 恢复中、临时网络失败保留凭证、重试 | `api-client.test.ts`、`domain.test.ts` | 已完成 |
| B02 登录注册 | `/(auth)/login` | SMS send、mobile login、policies/acceptances | 表单、协议、提交、错误 | auth + identity integration | 已完成 |
| B03 资料初始化 | `/(auth)/profile-setup` | `PATCH /me/profile` | 双 version、错误、内部返回地址 | `domain.test.ts`、stage 6 | 已完成 |
| B04 首页 | `/(buyer-tabs)` | companions、services | 骨架、空、失败、断网、重试、图片失败 | `domain.test.ts` | 已完成 |
| B05 搜索 | `/search` | companions/services Cursor list | 关键词、排序、竞态取消、状态恢复 | `stage-2-domain.test.ts` | 已完成 |
| B06 搜索结果—陪玩 | `/search?kind=companions` | `GET /companions` | Cursor、空/失败/刷新/图片占位 | stage 2 + seller-product integration | 已完成 |
| B07 搜索结果—服务 | `/search?kind=services` | `GET /services` | Cursor、排序、列表恢复 | stage 2 + seller-product integration | 已完成 |
| B08 陪玩公开主页 | `/companions/[id]` | companion detail、reviews | 不存在/受限、服务空态 | stage 2 | 已完成 |
| B09 服务详情 | `/services/[id]` | service detail、availability、favorite | 加载、失败、图片、可购矩阵 | stage 2/3 | 已完成 |
| B10 规格选择 | B09 内嵌 SKU 区 | service detail/SKU | active/inactive、价格分字符串 | stage 2/3 | 已完成 |
| B11 确认订单 | `/checkout/confirm` | `POST /orders/preview`、`POST /orders` | 重新预览、价格变化、幂等、重复点击 | `stage-3-checkout.test.ts`、order integration | 已完成 |
| B12 支付收银台 | `/orders/[id]/pay` | payment create/query | 不可支付、超时、渠道缺失；Mock 显式隔离 | stage 3/9 | 已完成 |
| B13 支付处理中 | `/payments/[id]/processing` | payment/order query | 有限退避、超时、前台重查、终态停止 | stage 3 | 已完成 |
| B14 支付结果 | `/payments/[id]/result` | payment/order query | 成功/失败/取消/关闭/处理中 | stage 3 | 已完成 |
| B15 购买订单列表 | `/(buyer-tabs)/orders` | `GET /orders` | 签名 Cursor、筛选/滚动恢复、下拉刷新 | stage 4 + order integration | 已完成 |
| B16 购买订单详情 | `/orders/[id]` | order detail/actions | 全状态、快照、服务端 available_actions、CAS | stage 4 | 已完成 |
| B17 退款申请 | `/refunds/new` | refund preview/create | 可退边界、分整数、幂等 | stage 4 + after-sale integration | 已完成 |
| B18 退款详情 | `/refunds/[id]` | refund detail/escalate | 等待/拒绝/介入/渠道/完成/关闭、CAS | stage 4 | 已完成 |
| B19 投诉提交 | `/complaints/new` | complaint create、file upload/complete | 订单/退款关联；最多 6 张私有证据，真实直传、校验和审核 | stage 4 + file storage | 已完成 |
| B20 投诉详情 | `/complaints/[id]` | complaint detail/logs | 处理中/补证/完成/关闭、刷新 | after-sale integration | 已完成 |
| B21 评价服务 | `/reviews/new` | `POST /reviews` | 1–5 星、文字、匿名、唯一性 | stage 4 | 已完成 |
| B22 已提交评价 | `/reviews/[id]` | review detail | 真实审核状态、无伪编辑 | stage 4 | 已完成 |
| B23 陪玩全部评价 | `/companions/[id]/reviews` | seller reviews Cursor | 骨架、空、失败、分页 | stage 2 | 已完成 |
| B24 消息列表 | `/(buyer-tabs)/messages` | conversations/unread | Cursor、未读、刷新、断网 | stage 5 | 已完成 |
| B25 文字聊天 | `/conversations/[id]` | messages/send/read | 发送幂等、历史锚点、前台 HTTP 轮询 | stage 5 + chat integration | 部分完成：无 WebSocket |
| B26 系统通知列表 | `/notifications` | notifications Cursor/unread | 已读/未读、分页、刷新 | stage 5 | 已完成 |
| B27 系统通知详情 | `/notifications/[id]` | notification detail/read/target verify | 权限、资源删除、安全深链 | stage 5 | 已完成 |
| B28 我的 | `/(buyer-tabs)/mine` | `GET /me`、summary APIs | 匿名拦截、脱敏资料、真实统计 | stages 1/6 | 已完成 |
| B29 我的收藏 | `/favorites` | favorites Cursor/detail | 空、失败回滚、重复点击、Toast | stage 2/9 | 已完成 |
| B30 优惠券占位 | `/coupons` | 无 | PRD 固定 0 张，不伪造业务 | stage 6 | 不在首期业务范围 |
| B31 编辑个人资料 | `/settings/profile` | `PATCH /me/profile` | user/profile 双 version、冲突刷新 | stage 6 | 已完成 |
| B32 买家公开主页 | `/users/[id]` | public profile | 隐私限制、不存在 | stage 5/6 | 已完成 |
| B33 平台规则与售后 | `/rules` | current policies/acceptances | 版本、未发布、失败 | stage 6 | 已完成 |
| B34 设置 | `/settings` | seller profile/logout | 加载、退出二次确认 | stage 6 | 已完成 |
| B35 隐私与安全 | `/settings/security` | me/sessions | 脱敏值、能力边界 | stage 6 | 已完成 |
| B36 手机号与实名 | `/settings/identity`、`phone-change` | identity status/submit | 实名可用且脱敏；换绑安全降级 | stage 6 + identity integration | 部分完成：换绑 API 缺失 |
| B37 隐私设置 | `/settings/privacy` | privacy GET/PATCH | 乐观更新、回滚、重读、Toast | stage 6/9 | 已完成 |
| B38 个人数据下载 | `/settings/data-export` | 缺失 | 明确不可用，无假任务/链接 | stage 6 | 被阻断 |
| B39 注销账号 | `/settings/account-cancellation` | 缺失 | 两次确认，不假注销 | stage 6 | 被阻断 |
| B40 平台客服 | `/support`、`/support/new`、`/[id]` | support cases/reopen/conversation | 排队/服务/转交/关闭/重开 | stage 5 + chat integration | 已完成 |
| B41 协议详情 | `/policies/[id]` | policy detail | 版本、发布时间、失败 | stage 6 | 已完成 |
| B42 游客登录拦截 | `/(auth)/required` | auth | 内部 returnTo 校验、登录后返回 | stages 1/2/9 | 已完成 |
| B43 预约时间 | `/checkout/schedule` | availability | 真实时段、过期/冲突排除 | stage 3 | 已完成 |
| B44 服务不可购买 | B09 内嵌全状态 | service/availability | 下架/审核/暂停/SKU/时段/本人 | stage 2 | 已完成 |
| B45 支付异常 | `/payment-error` | order/payment error codes | 价变/服务失效/渠道/未知错误 | stage 3 | 已完成 |
| B46 评价审核状态 | `/reviews/[id]` | review detail | 审核中/公开/未展示 | stage 4 | 已完成 |
| B47 消息发送全状态 | `/conversations/[id]` 内嵌 | send/read/messages | 发送中/已发送/已读/失败/原位重试 | stage 5 | 已完成 |

## 陪玩中心 S01–S19

| PRD | React Native 路由/实现 | 主要真实 API | 状态与测试 | 结论 |
|---|---|---|---|---|
| S01 申请陪玩 | `/seller/apply` | seller profile/application、file upload/complete | 草稿、CAS、资料完整性、头像/封面/声音上传审核；stage 7 + file storage | 已完成 |
| S02 申请状态 | `/seller/status` | profile/applications、file upload/complete | 未申请/草稿/审核/补资料/拒绝/通过/暂停/封禁，补充媒体可恢复 | 已完成 |
| S03 中心概览 | `/(seller-tabs)` | seller overview | 真实服务/订单/财务聚合；stage 7/8 | 已完成 |
| S04 主页管理 | `/seller/profile` | seller profile PATCH | CAS、accepting_orders、冲突刷新 | 已完成 |
| S05 公开主页预览 | `/seller/preview` | companion detail | 买家端展示组件复用、编辑权限隔离 | 已完成 |
| S06 发布服务 | `/seller/services/new` | seller services POST | 表单、真实草稿、无假封面 | 已完成 |
| S07 编辑服务 | `/seller/services/[id]/edit` | service/SKU PATCH/POST | version、整数分、有效 SKU 校验 | 已完成 |
| S08 服务管理 | `/(seller-tabs)/services` | seller service list/actions | 全状态、非法按钮隐藏、买家缓存失效 | 已完成 |
| S09 卖家订单列表 | `/(seller-tabs)/orders` | seller orders Cursor | 分页、筛选/滚动恢复、售后 | 已完成 |
| S10 卖家订单详情 | `/seller/orders/[id]` | seller order detail/actions | 服务端授权动作、CAS、重复动作 | 已完成 |
| S11 卖家退款处理 | `/seller/refunds`、`/[id]` | seller refunds/decision | 同意/拒绝/渠道处理中、version | 已完成 |
| S12 收益中心 | `/(seller-tabs)/earnings` | finance summary/policy | 可提现/锁定/已提现/负债/风险 | 已完成 |
| S13 收益明细 | `/seller/finance/incomes` | signed Cursor incomes/liabilities | `FlatList`、大整数金额、下拉/上拉；stage 8/9 | 已完成 |
| S14 收益提现 | `/seller/finance/withdraw` | policy/preview/create | 服务端预览、Idempotency-Key、二次确认 | 已完成 |
| S15 收款账户 | `/seller/finance/accounts` | payout accounts CRUD | 只展示脱敏摘要、CAS、使用中禁删 | 已完成 |
| S16 提现记录 | `/seller/finance/withdrawals` | signed Cursor withdrawals | `FlatList`、全状态、刷新 | 已完成 |
| S17 服务审核详情 | `/seller/services/[id]/review` | service detail | 真实原因、重新编辑入口 | 已完成 |
| S18 提现详情 | `/seller/finance/withdrawals/[id]` | withdrawal detail/logs | 全状态、脱敏账户、客服入口 | 已完成 |
| S19 卖家订单待开始 | S10 `ACCEPTED` 状态 | seller order detail/start | 服务端时间快照、禁止提前开始 | 已完成 |

## 全局状态 G01–G10

| PRD | 实现 | 自动化/证据 | 结论 |
|---|---|---|---|
| G01 加载 | `StateView`、`ListSkeleton`、按钮 busy、分页 footer | domain + 各阶段测试 | 已完成 |
| G02 空数据 | 主列表 `ListEmptyComponent`/明确占位 | domain + screen tests | 已完成 |
| G03 失败 | 用户文案、重试，不展示栈 | API error mapping + static audit | 已完成 |
| G04 断网 | 全局断网栏、关键页 offline state、恢复后 Query 同步 | stage 5/9 | 已完成 |
| G05 权限/受限 | B42、seller status/layout、无权资源状态 | stages 2/5/7/9 | 已完成 |
| G06 弹窗 | 退出、取消订单、确认完成、提现、删除等二次确认 | stages 3/4/6/8 | 已完成 |
| G07 Toast | 全局 `ToastProvider`，收藏/隐私已迁移；旧页仍有部分 inline banner | stage 9 static/unit | 部分完成 |
| G08 表单反馈 | RHF + Zod、字数、禁用、提交中 | stages 1/4/6/7/8 | 已完成 |
| G09 媒体上传 | 服务端策略、权限、选择/裁剪/录音、SHA-256、预签名 PUT、complete、恢复、审核、绑定和删除；无伪 `file_id` | file-storage + Mobile 上传测试；本地 MinIO 集成报告 | 部分完成：生产 OSS/CDN/恶意文件扫描与真机网络方案未接通 |
| G10 系统权限 | 相册/相机状态与设置引导；录制声音时按需申请麦克风 | stage 6 + native voice media | 部分完成：系统推送未接入 |

## 测试索引

- Mobile：`domain.test.ts`、`api-client.test.ts`、`secure-credentials.test.ts`、`stage-2-domain.test.ts`、`stage-3-checkout.test.ts`、`stage-4-after-sale.test.ts`、`stage-5-messaging.test.ts`、`stage-6-account.test.ts`、`stage-7-seller.test.ts`、`stage-8-seller-finance.test.ts`、`stage-9-release.test.ts`。
- API：`mobile-auth.integration.test.mjs`、`seller-product.integration.test.mjs`、`order-payment.integration.test.mjs`、`after-sale.integration.test.mjs`、`chat-support-notification.integration.test.mjs`、`identity-user.integration.test.mjs`、`finance.integration.test.mjs`、`user-journey.e2e.test.mjs`。
- 真正原生 UI E2E：当前仓库没有 Maestro/Detox 驱动器和可用的 iOS/Android 模拟器证据，不将 API E2E 冒充为原生 UI E2E。
