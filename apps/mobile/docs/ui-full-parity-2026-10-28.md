# 全量 UI 对齐追踪清单（2026-10-28）

## 结论与口径

**仍为部分对齐，不能标记“所有页面已与手机一致”。** 10 月 28 日清单枚举 74 个非布局路由文件、152 个 Web 设计目录入口；10 月 29 日当前 Web 预览目录已显示 153 个入口，后续应继续刷新逐项映射。目录入口包含同一路由的不同状态，也包含 V3.1 独立交互原型，不等于独立原生页面数量。

基准：`app/page.tsx`、`app/buyer-surfaces.css`、`app/conversation-list.css`、`app/user-theme.css`、`app/seller-workbench/`。本轮只改 Mobile，未修改 Web 设计、后端、后台或数据库 Schema 源文件。

公共样式本批已迁移：连续品牌背景、透明分区和细分隔线、紧凑页头、轻量输入框/按钮/状态页。此前 47 个页面的基础样式迁移不等于 47 个页面已逐屏验收。

## 原生路由逐项清单

### 2026-10-31 续验索引

最新批次见 [ui-sync-2026-10-31.md](./ui-sync-2026-10-31.md)：商品详情/规格弹层、店铺三栏目、收藏、身份胶囊、游客熊崽引导、共用状态、新规则确认订单、支付反馈、买卖家订单列表和申请资格状态继续同步。新增商品评价路由；当前原生非布局路由文件 76 个，Web 设计目录 153 个入口。下表保留历史验收口径，未更新的行不等于最新页面已全量通过。最新自动化 393/393 通过，真机结果与剩余差异分别记录，**全量一比一尚未完成**。

下列为 10 月 28 日批次清单。**10 月 29 日已恢复小米实测，具体已复核状态见下节；未列出的页面／状态仍待完成。** 历史已拍页面见 `ui-parity-2026-10-26.md`，不能用旧截图证明本批代码的最终结果。

### 2026-10-29 真机续验（不代表全量通过）

- 设备：已授权小米 `7d97cdc9`，仅操作 `com.xiongzai.esports.acceptance`。重新连接后 ADB 已授权，但 USB reverse 丢失、App 停在 Development Build 启动器；恢复 8089 / 3303 / 9000 映射后显式连接本地 Metro，正常加载首页，不再黑屏。本轮未清除 App 数据、未重装。
- API `127.0.0.1:3303` readiness 的数据库／对象存储均正常；沿用隔离环境，未修改共享库或生产。Metro 沿用 `EXPO_PUBLIC_APP_ENV=test` 与 `EXPO_PUBLIC_ANDROID_USB_REVERSE=true`。
- 新版消息页已真实显示“聊天＋搜索”，旧通知／客服大卡片不再出现。修复空会话巨型横线和大标题区，改为与 `ConversationList` 对应的 24dp 留白、13sp 正文；保留 12sp 媒体审核、无实时通话及站内交易说明，属于有意保留的安全提示差异。增加搜索按钮按压反馈。
- 真机已验证：卖家空会话、展开搜索、输入无匹配关键词、关闭键盘、收起后保留关键词、清除恢复空态、切换买家端后显示买家空会话。**没有验证本轮非空会话行、分页和完整聊天历史搜索，也没有验证 iOS。**
- 已查看并截屏：设置（审核已通过）、资金管理（零余额）、商品管理（一个在售隔离商品）。这些页面只是完成当前状态检查，不等于所有状态与设计一致。
- 本轮新增 2 项组件测试，原有测试保留：Mobile **335/335 通过，0 skipped**；TypeScript、lint 均通过（0 错误／0 警告）。日志：`/tmp/xiongzai-ui-20261029-{test,typecheck,lint}.log`。未重新进行原生构建或 iOS 验收。

证据目录：`.local/isolated-media-2026-10-25/`（开发工具浮动齿轮属于 Expo，不是产品按钮）。

| 证据文件 | 实际验证内容 | 结论 |
| --- | --- | --- |
| `xiaomi-seller-messages-final-20261029.png` | 卖家消息空态、页头、Tab、紫蓝背景 | 本状态已实测；保留安全说明 |
| `xiaomi-buyer-messages-final-20261029.png` | 买家消息空态、买家背景 | 本状态已实测 |
| `xiaomi-search-20261029.png` | 卖家本地会话搜索无结果 | 本状态已实测；不等于历史记录搜索 |
| `xiaomi-settings-20261029.png` | 设置入口与已通过身份展示 | 当前状态已查看；其他身份未验证 |
| `xiaomi-funds-20261029.png` | 真实零余额、测试提现提醒、账户与记录入口 | 有下述设计差异，未标齐 |
| `xiaomi-products-20261029.png` | 在售商品、分类、审核详情／管理按钮 | 有下述操作差异，未标齐 |

上述早一批次记录的差异（后续处理情况见下节）：

1. 商品管理：Web 有“更多／改价／改名额／编辑”，Mobile 在售态只有“审核详情／管理”；当前 `sellerServiceActions(ON_SALE)` 仅允许查看审核和下架。不得直接绕过服务端状态限制补可写按钮，需要核对真实快捷编辑能力后实现。
2. 资金管理：Web `funds` 为“账户资金”、待结算／售后冻结和逐笔订单明细；Mobile 为“资金管理”、五项真实账务指标和独立明细入口。不得把全部 `locked_cent` 冒充售后冻结，或删除真实欠款等风险信息来追求表面一致。
3. 搜索：Web 支持名称／历史消息查询及命中定位；Mobile 仅筛选已加载名称和最近摘要，本轮如实说明，仍未对齐完整能力。
4. 74 个路由、152 个设计状态仍未全量逐屏验收；小屏、大字体、横屏和 iOS 本轮均未实机验证。

注意：`xiaomi-messages-aligned-20261028.png` 文件名虽含 aligned，实际是旧缓存页面，不能作为新版对齐证明；`xiaomi-current-reloaded-20261028.png` 为当时黑屏记录。保留原文件，不删除或误报成功。

### 2026-10-29 商品、资金、评价续改

使用 UI/UX 检查清单复核布局、触控、反馈和安全区，以当前 Web 源码和本地设计预览为视觉依据，不引入新风格。本批未修改后端、后台、数据库 Schema；原有其他任务的修改仍保留。

- 商品管理：四个快捷操作位已改为“更多／改价／改名额／编辑”；更多弹层连接真实资料、审核、下架或删除管理入口。改价通过真实 SKU PATCH 提交 `version` 和精确 `price_cent`，保存后刷新商品与买家缓存。增加同步单飞和成功锁，防止旧点击回调重复提交。CAS 冲突重新读取，不重放写请求。
- 权限差异有意保留：在售状态后端不允许编辑，改价和编辑禁用并提示先下架；没有名额字段或接口，改名额明确“暂未开放”。未通过伪造成功或放宽状态校验补齐外观。
- 账户资金：与设计对齐“账户资金／可申请提现余额卡／两列金额／逐笔资金明细”。保留真实欠款、风控、累计收益和已提现，其他汇总可展开。`locked_cent` 使用“锁定金额”，不改称“售后冻结”。测试提现与账户入口移到列表下方，仍明确无真实打款。资金明细失败保留已加载记录，可重试分页。
- 账户资金和评价管理：新增共用 `SellerSectionPage`，恢复设计稿底部四个 Tab 和同源透明图标；通过 `dismissTo` 返回既有 Tab 栈，不建立第二套导航。底部单独计算手势区和大字体空间，未关闭字体缩放。
- 评价管理：增加买家评价标题、已加载/完整条数区分、金色评分、真实订单入口与同源箭头；空态改成轻量文字，不再显示旧版巨型横线。分页或同步失败保留已有评价，暂停资格不展示评价列表。原接口只提供公开评价，未虚构审核中记录或回复能力。
- 发布商品：将提交反馈移到固定页头下方。真机滚动到价格和完成时限后，实名校验错误仍保持可见，不再藏在表单顶部。

#### 本批实机结果与限制

- 小米 `7d97cdc9`，隔离包 `com.xiongzai.esports.acceptance`：已验证在售商品四操作显示、禁用状态、打开/关闭更多弹层；资金零余额、展开/收起汇总、底部“我的”返回；评价零条空态与底部导航；发布页输入标题/描述/价格/完成时限及保存错误反馈。
- 尝试保存隔离测试草稿 `UI price check 1029` 被后端“交易前需完成有效的人工实名认证”拒绝。未调整权限、未修改后台、未绕过校验、未提交审核，不能将此记为草稿创建或改价成功。需要通过正规隔离测试流程准备具备有效人工实名状态的测试账号，再继续验证可写商品链路。
- 改价成功、双击保护、CAS、卸载安全、超大金额、评价非空/分页错误、财务非空记录跳转目前覆盖自动化测试；**不是本批真机验收结果**。
- iOS、全页面/全状态、小屏和大字体实机结果仍待验证。全量对齐未完成；聊天全文搜索与命中定位、名额管理仍缺后端支持，不能以当前样式修复宣称功能一致。

| 新证据文件（同目录） | 实际内容 |
| --- | --- |
| `xiaomi-products-actions-20261029.png` | 在售商品四操作与权限说明 |
| `xiaomi-product-more-20261029.png` | 更多弹层、关闭与管理入口 |
| `xiaomi-funds-dock-final-20261029.png` | 最新账户资金余额卡、真实零金额、底部导航 |
| `xiaomi-funds-expanded-20261029.png` | 累计收益、已提现和欠款展开 |
| `xiaomi-seller-reviews-final-20261029.png` | 最新评价轻量空态与底部导航 |
| `xiaomi-publish-visible-blocker-20261029.png` | 表单已下滚，实名校验反馈仍固定可见 |

`xiaomi-funds-aligned-20261029.png` 是本批补底部导航前截图；`xiaomi-seller-reviews-20261029.png` 是移除旧空态前截图，均不作为最终样式证据。

验证：新增 11 项测试，Mobile **346/346 通过，0 skipped**；TypeScript、lint 通过，0 错误/0 警告；`git diff --check` 通过。日志 `/tmp/xiongzai-align-next-{tests,typecheck,lint}.log`。iOS / Android Expo Bundle 均成功导出到 `/tmp/xiongzai-ui-align-final-20261029.UC9i06`，日志 `/tmp/xiongzai-align-next-export.log`；这是 JS/Hermes 与素材导出，不是原生安装包构建。原生签名构建、iPhone 安装和完整视觉验收未执行。

本批修改文件：`src/features/seller/product-quick-actions.tsx`、`seller-services-screen.tsx`、`seller-funds-screen.tsx`、`seller-reviews-screen.tsx`、`seller-service-create-screen.tsx`、`src/components/seller-section-page.tsx`、`tests/merchant-parity-actions.test.ts`、本追踪文档。隔离设备辅助脚本仅新增向上滚动，继续限制为已授权设备上的隔离 App。

| 路由文件（相对 app） | 实际入口模块 | 本批状态 |
| --- | --- | --- |
| `(auth)/login` | `@/features/auth/login-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(auth)/profile-setup` | `@/features/auth/profile-setup-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(auth)/required` | `@/features/auth/auth-required-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(buyer-tabs)/index` | `@/features/home/home-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(buyer-tabs)/messages` | `@/features/chat/messages-screen` | 本批专属布局已改；名称/摘要搜索已接入，完整历史搜索未对齐 |
| `(buyer-tabs)/mine` | `@/features/auth/protected-tab`、`@/features/account/mine-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(buyer-tabs)/orders` | `@/features/checkout/orders-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(seller-tabs)/earnings` | `@/features/seller/seller-earnings-summary-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(seller-tabs)/index` | `@/features/seller/seller-overview-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(seller-tabs)/messages` | `@/features/chat/messages-screen` | 本批专属布局已改；身份过滤及卖家背景已覆盖测试 |
| `(seller-tabs)/mine` | `@/features/seller/seller-mine-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(seller-tabs)/orders` | `@/features/seller/seller-orders-summary-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `(seller-tabs)/services` | `@/features/seller/seller-services-screen` | 四操作与更多弹层已对齐并实测在售态；名额无接口，可写改价真机受测试实名状态阻断 |
| `announcements/[id]` | `@/features/home/home-announcements` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `checkout/confirm` | `@/features/checkout/confirm-order-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `checkout/schedule` | `@/features/checkout/schedule-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `companions/[id]/reviews` | `@/features/discovery/companion-reviews-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `companions/[id]` | `@/features/discovery/companion-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `complaints/[id]` | `@/features/after-sale/complaint-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `complaints/new` | `@/features/after-sale/complaint-create-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `conversations/[id]` | `@/features/chat/chat-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `coupons` | 路由内组件／共享组件 | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `favorites` | `@/features/favorites/favorites-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `feedback` | `@/features/community/feedback-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `index` | `@/features/splash/splash-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `notifications/[id]` | `@/features/chat/notification-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `notifications/index` | `@/features/chat/notifications-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `orders/[id]/pay` | `@/features/checkout/payment-screen` | 本批支付选择容器已改；保持 Mock 和服务端结果 |
| `orders/[id]` | `@/features/checkout/order-detail-screen` | 本批状态区与基础样式已改；全状态逐屏复核待进行 |
| `payment-error` | `@/features/checkout/payment-error-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `payments/[id]/processing` | `@/features/checkout/payment-processing-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `payments/[id]/result` | `@/features/checkout/payment-result-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `policies/[id]` | `@/features/account/policy-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `quick-match` | `@/features/home/catalog-home-screen`、`@/features/home/catalog-card`、`@/features/home/home-domain`、`@/features/discovery/discovery-api`、`@/features/discovery/discovery-domain` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `refunds/[id]` | `@/features/after-sale/refund-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `refunds/new` | `@/features/after-sale/refund-create-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `reviews/[id]` | `@/features/after-sale/review-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `reviews/new` | `@/features/after-sale/review-create-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `rules` | `@/features/account/rules-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `search` | `@/features/discovery/search-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/apply` | `@/features/seller/seller-application-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/finance/accounts` | `@/features/seller/seller-payout-accounts-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/finance/incomes` | `@/features/seller/seller-income-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/finance/index` | `@/features/seller/seller-funds-screen` | 余额卡、逐笔明细与底部导航已改；零余额及展开/返回真机验证，非空/风控实机待验 |
| `seller/finance/withdraw` | `@/features/seller/seller-withdraw-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/finance/withdrawals/[id]` | `@/features/seller/seller-withdrawals-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/finance/withdrawals/index` | `@/features/seller/seller-withdrawals-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/orders/[id]` | `@/features/seller/seller-order-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/preview` | `@/features/seller/seller-preview-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/profile` | `@/features/seller/seller-profile-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/refunds/[id]` | `@/features/seller/seller-refund-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/refunds/index` | `@/features/seller/seller-refund-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/reviews` | `@/features/seller/seller-reviews-screen` | 标题/数量/评分/订单入口/底部导航已改；空态真机验证，非空与分页错误覆盖自动化 |
| `seller/services/[id]/edit` | `@/features/seller/seller-service-edit-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/services/[id]/review` | `@/features/seller/seller-service-review-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `seller/services/new` | `@/features/seller/seller-service-create-screen` | 固定可见提交反馈已改并真机验证；草稿写入被测试账号实名条件拦截，未绕过 |
| `seller/status` | `@/features/seller/seller-status-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `services/[id]` | `@/features/discovery/service-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/account-cancellation` | `@/features/account/unavailable-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/data-export` | `@/features/account/unavailable-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/identity` | `@/features/account/identity-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/index` | `@/features/account/settings-screen` | 本批紧凑入口已改；权限及退出逻辑保留 |
| `settings/media-avatar` | `@/features/account/media-avatar-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/permissions` | `@/features/account/permissions-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/phone-change` | `@/features/account/unavailable-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/policy-acceptances` | `@/features/account/policy-acceptance-records-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/privacy` | `@/features/account/privacy-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/profile` | `@/features/account/profile-edit-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/security` | `@/features/account/security-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `settings/sessions` | `@/features/account/sessions-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `support/[id]` | `@/features/chat/support-detail-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `support/index` | `@/features/chat/support-list-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `support/new` | `@/features/chat/support-create-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |
| `users/[id]` | `@/features/chat/public-user-screen` | 保留原逻辑；公共样式按组件引用生效，专属布局及全状态待逐屏复核 |

## Web 设计状态目录

下表为设计目录的逐项待核对清单，**不是完成标记**。同名不同状态需分别使用真实隔离业务数据触发；禁止用设计示例当成服务端成功结果。V3.1 设计中补充履约、申诉、资金明细等还须逐项确认原生入口、契约及状态覆盖，不能只换配色就称为对齐。

| 设计 ID | 目录名称 | 验收状态 |
| --- | --- | --- |
| `sellerTradeRules` | 卖家 · V3.1 规则快照 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeFunds` | 卖家 · 资金冻结与结算明细 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeSpecial` | 卖家 · 终结后特殊申诉 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeRefund` | 卖家 · 渠道退款进度 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeRuling` | 卖家 · 判责结果与两级申诉 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradePlatform` | 卖家 · 平台介入与举证 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeRejected` | 卖家 · 拒绝退款与介入窗口 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeSecondAppeal` | 卖家 · 二次申诉与新证据 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeRemedyReceipt` | 卖家 · 补充履约待验收 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeRemedy` | 卖家 · 补充履约与验收 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeCase` | 卖家 · 售后处理与协商 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeEvidence` | 卖家 · 履约凭证与追加 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeDetail` | 卖家 · 订单详情与履约 | 待与对应原生路由及真实状态逐项核对 |
| `sellerTradeOrders` | 卖家 · 订单列表 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeRules` | 买家 · V3.1 规则快照 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeFunds` | 买家 · 资金冻结与结算明细 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeSpecial` | 买家 · 终结后特殊申诉 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeReview` | 买家 · 评价与交易终结 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeRefund` | 买家 · 渠道退款进度 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeRuling` | 买家 · 判责结果与两级申诉 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradePlatform` | 买家 · 平台介入与举证 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeRejected` | 买家 · 拒绝退款与介入窗口 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeSecondAppeal` | 买家 · 二次申诉与新证据 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeRemedyReceipt` | 买家 · 补充履约待验收 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeRemedy` | 买家 · 补充履约与验收 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeCase` | 买家 · 售后处理与协商 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeApply` | 买家 · 申请与修改售后 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeEvidence` | 买家 · 履约凭证与追加 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeDetail` | 买家 · 订单详情与履约 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeCheckout` | 买家 · 确认订单与支付 | 待与对应原生路由及真实状态逐项核对 |
| `buyerTradeOrders` | 买家 · 订单列表 | 待与对应原生路由及真实状态逐项核对 |
| `splash` | 启动页 | 待与对应原生路由及真实状态逐项核对 |
| `auth` | 登录注册 | 待与对应原生路由及真实状态逐项核对 |
| `profileSetup` | 资料初始化 | 待与对应原生路由及真实状态逐项核对 |
| `policyCenter` | 协议与隐私中心 | 待与对应原生路由及真实状态逐项核对 |
| `agreementDetail` | 协议详情与版本 | 待与对应原生路由及真实状态逐项核对 |
| `policyAcceptances` | 我的接受记录 | 待与对应原生路由及真实状态逐项核对 |
| `sellerPolicyConfirm` | 陪玩入驻协议确认 | 待与对应原生路由及真实状态逐项核对 |
| `authGuard` | 游客登录拦截 | 待与对应原生路由及真实状态逐项核对 |
| `home` | 首页 | 待与对应原生路由及真实状态逐项核对 |
| `announcementDetail` | 公告详情 | 待与对应原生路由及真实状态逐项核对 |
| `search` | 搜索 | 待与对应原生路由及真实状态逐项核对 |
| `searchResults` | 搜索结果 | 待与对应原生路由及真实状态逐项核对 |
| `companion` | 陪玩主页 | 待与对应原生路由及真实状态逐项核对 |
| `service` | 服务详情 | 待与对应原生路由及真实状态逐项核对 |
| `serviceUnavailable` | 服务不可购买 | 待与对应原生路由及真实状态逐项核对 |
| `specs` | 规格选择 | 待与对应原生路由及真实状态逐项核对 |
| `bookingSchedule` | 预约时间 | 待与对应原生路由及真实状态逐项核对 |
| `favorites` | 我的收藏 | 待与对应原生路由及真实状态逐项核对 |
| `allReviews` | 全部评价 | 待与对应原生路由及真实状态逐项核对 |
| `reviewDetail` | 已提交评价 | 待与对应原生路由及真实状态逐项核对 |
| `reviewStates` | 评价审核状态 | 待与对应原生路由及真实状态逐项核对 |
| `messages` | 消息列表 | 待与对应原生路由及真实状态逐项核对 |
| `notifications` | 系统通知 | 待与对应原生路由及真实状态逐项核对 |
| `notificationDetail` | 通知详情 | 待与对应原生路由及真实状态逐项核对 |
| `chat` | 文字聊天 | 待与对应原生路由及真实状态逐项核对 |
| `chatStates` | 消息发送全状态 | 待与对应原生路由及真实状态逐项核对 |
| `customerService` | 平台客服 | 待与对应原生路由及真实状态逐项核对 |
| `checkout` | 确认订单 | 待与对应原生路由及真实状态逐项核对 |
| `payment` | 支付 | 待与对应原生路由及真实状态逐项核对 |
| `paymentResult` | 支付结果 | 待与对应原生路由及真实状态逐项核对 |
| `paymentExceptions` | 支付异常处理 | 待与对应原生路由及真实状态逐项核对 |
| `orders` | 购买订单 | 待与对应原生路由及真实状态逐项核对 |
| `orderDetail` | 订单详情 | 待与对应原生路由及真实状态逐项核对 |
| `orderAccepted` | 订单·待开始 | 待与对应原生路由及真实状态逐项核对 |
| `refundApply` | 申请退款 | 待与对应原生路由及真实状态逐项核对 |
| `refundDetail` | 退款详情 | 待与对应原生路由及真实状态逐项核对 |
| `complaint` | 投诉介入 | 待与对应原生路由及真实状态逐项核对 |
| `complaintDetail` | 投诉详情 | 待与对应原生路由及真实状态逐项核对 |
| `review` | 评价服务 | 待与对应原生路由及真实状态逐项核对 |
| `transactionStates` | 交易完整状态 | 待与对应原生路由及真实状态逐项核对 |
| `mine` | 我的 | 待与对应原生路由及真实状态逐项核对 |
| `buyerProfile` | 买家公开主页 | 待与对应原生路由及真实状态逐项核对 |
| `coupons` | 优惠券占位 | 待与对应原生路由及真实状态逐项核对 |
| `editProfile` | 编辑资料 | 待与对应原生路由及真实状态逐项核对 |
| `privacySecurity` | 隐私与安全 | 待与对应原生路由及真实状态逐项核对 |
| `rules` | 平台规则 | 待与对应原生路由及真实状态逐项核对 |
| `settings` | 设置 | 待与对应原生路由及真实状态逐项核对 |
| `sellerApplyForm` | 陪玩申请 | 待与对应原生路由及真实状态逐项核对 |
| `sellerApplyStatus` | 申请状态 | 待与对应原生路由及真实状态逐项核对 |
| `seller` | 经营概览 | 待与对应原生路由及真实状态逐项核对 |
| `sellerProfile` | 主页管理 | 待与对应原生路由及真实状态逐项核对 |
| `sellerMessages` | 卖家消息 | 待与对应原生路由及真实状态逐项核对 |
| `sellerChat` | 卖家聊天 | 待与对应原生路由及真实状态逐项核对 |
| `companion` | 公开主页预览 | 待与对应原生路由及真实状态逐项核对 |
| `sellerPublish` | 发布服务 | 待与对应原生路由及真实状态逐项核对 |
| `sellerServices` | 服务管理 | 待与对应原生路由及真实状态逐项核对 |
| `sellerServiceEdit` | 编辑服务 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrders` | 卖家订单 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrderDetail` | 卖家订单详情 | 待与对应原生路由及真实状态逐项核对 |
| `sellerMine` | 卖家我的 | 待与对应原生路由及真实状态逐项核对 |
| `sellerRevenue` | 收益数据 | 待与对应原生路由及真实状态逐项核对 |
| `sellerEarnings` | 收益中心 | 待与对应原生路由及真实状态逐项核对 |
| `incomeDetails` | 收益明细 | 待与对应原生路由及真实状态逐项核对 |
| `withdraw` | 收益提现 | 待与对应原生路由及真实状态逐项核对 |
| `payoutAccounts` | 收款账户管理 | 待与对应原生路由及真实状态逐项核对 |
| `withdrawals` | 提现记录 | 待与对应原生路由及真实状态逐项核对 |
| `sellerStateMatrix` | 陪玩中心完整状态 | 待与对应原生路由及真实状态逐项核对 |
| `paymentProcessing` | 支付处理中 | 待与对应原生路由及真实状态逐项核对 |
| `paymentResult` | 支付成功 | 待与对应原生路由及真实状态逐项核对 |
| `paymentFailure` | 支付失败 | 待与对应原生路由及真实状态逐项核对 |
| `paymentCancelled` | 用户取消支付 | 待与对应原生路由及真实状态逐项核对 |
| `paymentClosed` | 订单已关闭 | 待与对应原生路由及真实状态逐项核对 |
| `paymentTimeout` | 支付确认超时 | 待与对应原生路由及真实状态逐项核对 |
| `orderPendingPayment` | 订单·待付款 | 待与对应原生路由及真实状态逐项核对 |
| `orderDetail` | 订单·待接单 | 待与对应原生路由及真实状态逐项核对 |
| `orderAccepted` | 订单·已接单待开始 | 待与对应原生路由及真实状态逐项核对 |
| `orderInService` | 订单·服务中 | 待与对应原生路由及真实状态逐项核对 |
| `orderPendingConfirm` | 订单·待确认 | 待与对应原生路由及真实状态逐项核对 |
| `orderCompleted` | 订单·完成待评价 | 待与对应原生路由及真实状态逐项核对 |
| `orderReviewed` | 订单·已评价 | 待与对应原生路由及真实状态逐项核对 |
| `orderCancelled` | 订单·已取消 | 待与对应原生路由及真实状态逐项核对 |
| `orderSellerRejected` | 订单·陪玩拒单 | 待与对应原生路由及真实状态逐项核对 |
| `orderAfterSale` | 订单·售后中 | 待与对应原生路由及真实状态逐项核对 |
| `orderRefunded` | 订单·已退款 | 待与对应原生路由及真实状态逐项核对 |
| `refundDetail` | 退款·等待陪玩 | 待与对应原生路由及真实状态逐项核对 |
| `refundRejected` | 退款·陪玩拒绝 | 待与对应原生路由及真实状态逐项核对 |
| `refundPlatform` | 退款·平台介入 | 待与对应原生路由及真实状态逐项核对 |
| `refundProcessing` | 退款·渠道处理中 | 待与对应原生路由及真实状态逐项核对 |
| `refundCompleted` | 退款·已完成 | 待与对应原生路由及真实状态逐项核对 |
| `refundClosed` | 退款·已关闭 | 待与对应原生路由及真实状态逐项核对 |
| `complaintDetail` | 投诉·处理中 | 待与对应原生路由及真实状态逐项核对 |
| `complaintEvidence` | 投诉·补充证据 | 待与对应原生路由及真实状态逐项核对 |
| `complaintCompleted` | 投诉·处理完成 | 待与对应原生路由及真实状态逐项核对 |
| `complaintClosed` | 投诉·已关闭 | 待与对应原生路由及真实状态逐项核对 |
| `phoneSecurity` | 手机号与安全验证 | 待与对应原生路由及真实状态逐项核对 |
| `privacySettings` | 隐私设置 | 待与对应原生路由及真实状态逐项核对 |
| `dataExport` | 个人数据下载 | 待与对应原生路由及真实状态逐项核对 |
| `accountCancellation` | 注销账号 | 待与对应原生路由及真实状态逐项核对 |
| `sellerApplyReview` | 申请·审核中 | 待与对应原生路由及真实状态逐项核对 |
| `sellerApplySupplement` | 申请·补充资料 | 待与对应原生路由及真实状态逐项核对 |
| `sellerApplyRejected` | 申请·审核未通过 | 待与对应原生路由及真实状态逐项核对 |
| `sellerApplyStatus` | 申请·审核通过 | 待与对应原生路由及真实状态逐项核对 |
| `sellerApplySuspended` | 申请·资格暂停 | 待与对应原生路由及真实状态逐项核对 |
| `serviceAuditDetail` | 服务审核详情 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrderAccepted` | 卖家订单·待开始 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrderInService` | 卖家订单·服务中 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrderPendingConfirm` | 卖家订单·待确认 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrderCompleted` | 卖家订单·已完成 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrderClosed` | 卖家订单·已关闭 | 待与对应原生路由及真实状态逐项核对 |
| `sellerOrderRefunded` | 卖家订单·已退款 | 待与对应原生路由及真实状态逐项核对 |
| `sellerRefund` | 卖家退款处理 | 待与对应原生路由及真实状态逐项核对 |
| `withdrawalDetail` | 提现记录详情 | 待与对应原生路由及真实状态逐项核对 |
| `mediaWorkflow` | 图片上传与裁剪 | 待与对应原生路由及真实状态逐项核对 |
| `permissionCenter` | 系统权限说明 | 待与对应原生路由及真实状态逐项核对 |
| `globalStates` | 加载·失败·断网总览 | 待与对应原生路由及真实状态逐项核对 |
| `emptySearch` | 空搜索结果 | 待与对应原生路由及真实状态逐项核对 |
| `emptyOrders` | 空订单 | 待与对应原生路由及真实状态逐项核对 |
| `emptyMessages` | 空消息 | 待与对应原生路由及真实状态逐项核对 |
| `emptyFavorites` | 空收藏 | 待与对应原生路由及真实状态逐项核对 |
| `emptyIncome` | 空收益 | 待与对应原生路由及真实状态逐项核对 |
| `restrictedAccess` | 权限与受限状态 | 待与对应原生路由及真实状态逐项核对 |

## 已知差异 / 不应通过造数据消除的差异

- 消息：原生本批提供已加载名称和最近消息摘要搜索；Web 原型支持扫描聊天历史并定位命中。全量历史搜索与命中定位仍是待补差异，当前文案没有宣称已实现。
- 消息：通知保留首页“官方通知”，客服保留买家/卖家“我的”；不再放两个旧版大入口卡。空会话保留媒体审核与禁止实时通话提示。
- 资金：保留全部真实可提现、累计收益、待结算、锁定、已提现、欠款和风控暂停信息，不能按设计示例写入固定金额。
- Mock 支付、测试提现、安全权限、敏感资料脱敏提示必须保留，即使设计稿示例较短。
- 本批未验证 iPhone、字号放大、小屏、键盘、全部非空列表及售后状态；Bundle 导出和自动化测试不等于真机视觉通过。
- 2026-10-28 手机 USB 已授权，但检查时隔离包不在前台，未越权操作其他 App。旧 API/Metro 已停，本轮已恢复：新随机隔离 Schema API 3302、网关 3303、控制端 3304；数据库和本地 MinIO health/ready 通过；Metro 8089 IPv4 本机监听正常。USB 3303/8089/9000 映射已恢复。后续测试需重新登录，不能复用旧随机 Schema 的登录状态。
