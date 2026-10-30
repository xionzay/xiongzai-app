# 熊崽电竞 App｜PRD 路由、API 与测试追踪矩阵

2026-10-27 商品续批：S06/S07/S08 对齐紧凑页头、商品横向分类/搜索/排序、发布字段分组、图片与规格折叠；小米实测分类、搜索空态、多规格输入切换保留、在售只读和进入编辑。Mobile **325/325**、类型检查、lint 零警告、diff 通过；未重新提交商品、上传图片或验收 iPhone。库存/多维规格接口差异未伪造实现，仍不是全量 UI 完成，见 [本批证据与边界](./ui-parity-2026-10-26.md)。

2026-10-27 UI 续验：小米复核待评价定位与卖家箭头；S03 首页改为同源店铺身份/经营指标/工具/待办布局，S09 首页分类联动和卖家空态修复。实测首页、订单分类、商品入口、资金、评价入口及 API 503 → 重试恢复。Mobile **322/322**、类型检查、lint 零警告、双平台 JS Bundle 与 diff 检查通过。今日成交字段缺失明确显示“—”；商品管理/发布、非空待办、其他页面及 iPhone 仍待验收。**仍不是全量页面视觉一致或可生产发布**。证据与精确限制见 [UI 对齐进度](./ui-parity-2026-10-26.md)。

2026-10-26 UI 对齐第一批：买家我的、首页卡片、聊天背景与工具栏、熊崽表情封面、卖家四 Tab、卖家我的与收益结构已调整。Mobile **318/318**、类型检查、lint（零警告）及双平台 Bundle 通过。小米已查看我的和聊天；随后设备断连，其他改动仍待设备复核。**不是全量页面视觉验收通过**，详见 [UI 对齐进度与剩余项](./ui-parity-2026-10-26.md)。

2026-10-25 B25/B47 设备续验：Android/iOS 双账号模拟器已实测文字双向、表情、Android 图片/语音上传→人工审核→发送→iOS 读取/播放、Android 失败文字及待发语音冷启动恢复、同编号去重。G09 上传审核禁用、G10 iOS 首次麦克风拒绝反馈已验；G04 仅模拟 API 503，不是物理断网。Mobile 当前 **303/303**、类型/lint 通过，媒体专项 **46/46**。iOS Keychain 持久登录、实体机、真实录音及反向媒体矩阵未完成；B25/B47 仍不可标为全面完成。见 [实际证据与阻断](../../../docs/frontend-final-2026-10-12/聊天媒体双账号设备验收-2026-10-25.md)，其余页面不因本轮测试自动升级完成度。

2026-10-25 反馈/公告续验：App `/feedback` 已接入独立反馈提交、动态规则、个人历史/回复和安全同编号重试；首页和 `/announcements/[id]` 读取真实已发布公告及运行时封面短链，通知新增 FEEDBACK/ANNOUNCEMENT 目标。App 最终 299/299、类型检查、Lint 通过，两平台离线导出成功；不代表新页面已完成设备点按验收。Web/后台反馈公告页面仍需接入，优惠券继续未开放。下文旧“意见反馈不可提交”仅为历史状态，详见 [反馈公告接入与本地回归](../../../docs/App反馈公告接入与本地回归-2026-10-25.md)。

2026-10-25 更新：B25/B47 会话详情已接入真实 STICKER / IMAGE / VOICE、共享 V3 素材、私有上传/审核、会话成员媒体访问鉴权、失败同编号重试及后台停止展示。用户已批准必要 Schema 扩展，仅执行隔离测试迁移；未升级共享开发库和已安装 App。Mobile 282/282、类型/lint、两平台 test Bundle 通过；API 198/198、数据库 41/41、完整后端回归通过，含本地 MinIO 媒体双用户 API 联调。**代码/隔离 API 完成，不是设备验收完成**：B25/B47 新媒体设备收发、B40 客服列表内嵌表情/媒体入口、声音名片及完整交易/经营设备流程仍待验收。接口/状态映射见 [本轮记录](../../../docs/frontend-final-2026-10-12/原生聊天补齐-2026-10-25.md)。以下旧矩阵中“原生只有文字”或“媒体受 Schema 阻断”仅为历史状态。

历史矩阵日期：2026-08-22。以下 B/S/G 编号表保留阶段 1–9 的历史验证口径，不代表 2026-10 的 V3.7 全产品验收。

2026-10-17 最新 Web 收尾：下文 349/359 与 lint 2 错误已关闭。当前 Web 构建及 **370/370** 通过、根 lint **0 错误/69 警告**；Mobile 再跑类型/lint 和 **270/270** 通过。新增实际共用输入组件 8 项交互/生命周期回归，并以浏览器本地设计示例复验键盘、草稿退出保护、表情/更多面板和 375px 布局。不是原生 IME 或真实会话发送验收，不改变下文未完成页面/媒体边界；详情见 [最新收尾](../../../docs/frontend-final-2026-10-12/后端幂等与隔离验收-2026-10-17.md)。

## 2026-10-17 最新隔离 Android 设备证据

B25/B47 商品咨询：真实详情页三次进入均为同一会话，原文字仍在；B40：首条创建服务端提交后代理延迟至 App 超时，冷启动恢复登录、重填同内容重试仍返回同一工单/请求编号，消息/日志/事件各一份。使用独立 App 包名、专用 API 和随机测试 Schema，不影响原 App。Mobile 最新为 270/270、类型/lint 通过，Android 独立开发包及两平台 Bundle 通过、Doctor 21/21；Web 当前 349/359、根 lint 2 错误/71 警告，另列待处理，未改其视觉或断言。详情见 [最新隔离验收](../../../docs/frontend-final-2026-10-12/后端幂等与隔离验收-2026-10-17.md)。仍不能将全部页面、声音名片、实体机与 iOS 全流程标完成。

## 2026-10-17 咨询/客服后端补验（上一轮快照）

用户明确授权后端修复后，B25/B47 的商品咨询入口已按买家+商品原子复用，B40 的首条 TEXT 工单创建按完整请求及 `client_message_id` 幂等。Mobile 两个创建入口通过 SecureStore outbox 复用重试编号，身份/卸载门禁保持；Web 首条文字同样携带编号。专项 18/18、Mobile 265/265、API 172/172、后端 E2E 22/22、数据库 40/40、Web 358/358，类型/lint、Doctor 21/21 和两平台 test Bundle 通过。未修改 Schema/后台，未重启共享 API，未新增设备 GUI 证据；详细兼容边界和日志见 [隔离补验](../../../docs/frontend-final-2026-10-12/后端幂等与隔离验收-2026-10-17.md)。下文 10-16 表格中的两项后端待补齐描述为历史状态；不能将其余设备、媒体和实时能力标为完成。

## 2026-10-17 Android 更新

取得 Android 专用测试驱动授权后，已实测登录/草案门禁、冷启动恢复、预约下单、两种 Mock 支付、支付宝失败重试、订单文字聊天及原会话历史、退款申请、陪玩订单读取和零余额提现限制、麦克风拒绝。修复预约中文日期、支付错误/旧缓存竞态、后台登录拦截抢跳和 Tab 大字体/安全区；最终 Mobile 类型/lint 零错误/警告、257/257、Doctor 21/21、两平台 Bundle 和 Development Build 通过。Web 构建及 341/341 通过，根 lint 0 错误/69 警告。不能据此将全部 B/S/G、新 PRD 流程和双平台实体设备标为完成，详见 [Android 续验记录](../../../docs/frontend-final-2026-10-12/设备续验-2026-10-17.md)。下文“Android 安装未验收”为 10-16 历史状态。

| 页面/范围 | 新增设备与自动化证据 | 仍未完成 |
|---|---|---|
| B02/B11–B16/B43/B45 | Android 登录、真实时段、预览/下单、微信 PAID、支付宝 FAILED→重试 PAID、查询超时/过期拒付；中文日期和错误映射回归 | 两平台所有支付终态/前后台竞态与全导航堆栈设备复测 |
| B17/B18 | 实际创建退款、原支付宝测试渠道、等待陪玩处理 | 退款渠道终态、介入与卖家处理全状态 |
| B25/B47 | Android 真实订单会话文字发送，返回后消息仍在 | 原生 STICKER、图片、语音消息与实时网关仍未接入 |
| S03/S09/S12/S14 | 已通过身份入口、订单与售后列表、真实零收益/零余额、仅脱敏微信/支付宝、Mock 提示 | 新商品经营、履约、提现全链路；不注入余额伪造通过 |
| G09/G10/全局导航 | 保留声音名片，Android 麦克风拒绝；首页 1.3 倍字体 Tab 避开手势区；新增焦点守卫 6 项、Tab 指标 4 项测试 | 声音录制/上传/审核/试听、相机/相册拒绝、TalkBack/VoiceOver、小屏与其他页面大字体 |

## 2026-10-16 最新续验

见 [本轮设备与聊天验收记录](../../../docs/frontend-final-2026-10-12/设备续验-2026-10-16.md)。Mobile 240/240、零 lint 错误/警告、TypeScript、Doctor 21/21、两平台 Bundle 与 Development Build 通过。新版 iOS 已进入真实首页；Android 安装和实体设备全链路仍未验收。

| 页面 | 本轮更新 | 剩余边界 |
|---|---|---|
| B25/B47 文字聊天 | 同步防连点、串行 outbox、退出失效、稳定编号重试、已确认消息不误报失败；实际发送及原会话历史恢复通过 | 商品再次咨询会新建空会话，需后端原子复用；不是原消息丢失。原生 STICKER/图片/语音消息仍未接入 |
| B40 平台客服 | 同屏消息/建工单防连点，存储与同步失败反馈、卸载和恢复测试 | 文字首条工单在网络结果不确定时的服务端创建幂等尚需补齐 |
| G01/G03/G08 | 发送前存储失败不调用发送；发送后清理/刷新失败不误报未送达；恢复记录可重试，不无限发送中 | 单元/回调测试不替代大字体、权限拒绝和双平台完整设备验收 |

## 2026-10-13 收尾复核

最新工程结果、原生构建、待验收流程与问题等级见 [前端最终验收报告](../../../docs/frontend-final-2026-10-12/验收报告.md)。当前产品已增加四游戏店铺/商品和新订单链路；旧预约页面仍用于存量预约订单，不应把旧编号统计当作新 PRD 的完成率。

| 范围 | 当前真实状态 | 验证或剩余事项 |
|---|---|---|
| B12 支付 | 微信 `WECHAT_APP`、支付宝 `ALIPAY_APP` 均为后端 Mock；明示测试支付 | Mobile 状态/幂等测试、两渠道隔离浏览器交易通过；实体设备未全量验收 |
| B25/B47 聊天 | 原生 App 当前只有 TEXT/SYSTEM 和受控 HTTP 轮询 | 未接原生图片、语音消息或 STICKER；声音名片不是语音消息。Web 正式聊天已有 STICKER 接口，`/sticker-preview` 单独是本地演示 |
| B30 领券中心 / 意见反馈 | 明确不可提交占位 | 不可标成真实优惠券或反馈业务完成 |
| B36 换绑 / B38 导出 / B39 注销 | 本轮固定范围主动关闭实际入口与深链，保留底层历史实现 | 后端已有相关能力不等于当前用户端允许开放；挂载不调用任务 API 的测试已补齐 |
| G09 图片/声音/履约媒体 | 策略、预签名 PUT、complete、审核、绑定、受控读取；本地 MinIO | 不是只有本地预览，也不是生产存储已接通；声卡 10–30 秒保留。生产存储/CDN/扫描仍需另行授权 |
| G10 权限 | 相册、相机、声音名片麦克风按需申请；锁定浅色 | 系统推送未接入；无 RTC 房间/通话。大字体、权限拒绝和后台恢复尚需双平台设备级验收 |
| 新商品/新订单与 V3.1 售后扩展 | 部分源码与自动化覆盖 | 协商轮次、补充履约、特殊申诉与追偿不能仅依据旧退款页宣称全部完成 |

共享仓库仍存在其他任务修改；本轮未提交版本。下表中的历史“已完成”只说明当时路由/API/测试存在，不等同本次真机视觉或生产验收。

状态口径：

- `已完成`：路由、真实 API、主要远程状态和自动化测试均存在。
- `部分完成`：主体可用，但实时网关、上传、推送或子能力被阻断。
- `被阻断`：只有明确的安全降级页，没有伪造成功。
- `不在首期业务范围`：PRD 明确要求占位，不实现假业务。

历史阶段合计：`68 已完成 / 5 部分完成 / 2 被阻断 / 1 不在首期业务范围`（不能用于当前 V3.7 完成率）。

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
