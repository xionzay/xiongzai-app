# 熊崽电竞后端本地测试收尾与 App 交接 V1.0

## 1. 本地运行边界

- PostgreSQL、MinIO、开发验证码、Mock 支付、Mock 退款和 Mock 提现仅用于本地和自动化测试。
- 未连接微信、支付宝、短信、实名、电子签、推送或提现第三方服务，不发生真实扣款或打款。
- 聊天仅支持文字和系统消息；不实现实时语音通话。`VOICE_SAMPLE` 声音名片及其上传、审核、绑定和软删除约束保留。
- 手机号换绑、个人数据导出和账号注销的后端任务接口尚未开放。App 已显式展示“未开放”，不发请求、不生成假任务、不伪造成功。

## 2. 支付接口

### 创建支付

`POST /api/v1/payments`

Headers:

```http
Authorization: Bearer <access-token>
Idempotency-Key: <8-128-character-random-key>
Content-Type: application/json
```

Body:

```json
{
  "order_id": "01900000-0000-7000-8000-000000000001",
  "payment_channel": "WECHAT_APP"
}
```

`payment_channel` 必须是 `WECHAT_APP` 或 `ALIPAY_APP`；支付宝请求只需将示例值替换为 `ALIPAY_APP`。本地两个选项分别路由到独立 Mock Provider，响应中的 `channel` 和 `client_payload.payment_channel` 会保留用户选择，不返回模糊的 `MOCK` 渠道。

### 支付单主动查询

`POST /api/v1/payments/{payment_id}/query`

服务端从支付单反查已保存渠道，客户端不能在查询时替换渠道。返回 `payment` 平台事实和 `provider_result`。App 仍以平台支付单和订单状态为最终事实。

### 本地渠道回调

- `POST /callbacks/v1/payments/WECHAT_APP`
- `POST /callbacks/v1/payments/ALIPAY_APP`
- `POST /callbacks/v1/refunds/WECHAT_APP`
- `POST /callbacks/v1/refunds/ALIPAY_APP`

回调渠道必须与数据库原支付渠道一致，否则分别返回 `PAYMENT_CHANNEL_MISMATCH` 或 `REFUND_CHANNEL_MISMATCH`。回调事件幂等，金额使用整数分十进制字符串。

`/callbacks/v1/payments/mock`、`/callbacks/v1/refunds/mock` 与 `/callbacks/v1/payouts/mock` 仅作 development/test 兼容入口。预发/生产不允许 Mock Provider，生产请求也会显式返回 `MOCK_*_DISABLED`。

## 3. 支付渠道一致性

| 环节 | 渠道来源 | 保护 |
|---|---|---|
| 创建 | 客户端 `payment_channel` | 闭集校验，写入 `payments.channel` |
| 幂等重放 | 原支付单 | 同键更换订单或渠道返回 409 |
| 主动查询 | 原支付单 | Provider Router 不接受客户端渠道 |
| 成功/失败回调 | 原支付单 + URL 渠道 | 签名、渠道、金额、状态和事件幂等校验 |
| 超时 | 原支付单 | Scheduler 只关闭原记录，不重建渠道 |
| 退款申请/回调 | `refunds.payment_id -> payments.channel` | 创建退款和回调均按原渠道路由 |

## 4. 提现和人工审核

- `POST /api/v1/seller/payout-accounts` 仅允许 `account_type: WECHAT | ALIPAY`，不支持银行卡。账户姓名和标识加密保存，响应仅返回脱敏值。
- 本地 Mock Payout Provider 完成账户校验、幂等打款号和签名回调模拟。重复回调由 Inbox 去重，成功与失败分别执行提现完成或锁定释放的平衡分录。
- 实名信息通过 `POST /api/v1/me/identity-verification` 加密提交，本轮通过 `/admin-api/v1/identity-verifications/{id}/review` 进行人工审核。管理员必须通过 MFA 并拥有 `identity.review`，审核使用 version CAS，审计快照不包含姓名或证件原文。

## 5. App 改造清单

1. 收银台向用户展示“微信支付”和“支付宝”，分别提交 `WECHAT_APP` 和 `ALIPAY_APP`。
2. 同一次支付重试必须复用原 Idempotency-Key 和原渠道；用户改选渠道时生成新键。
3. 仅使用支付创建响应的 `client_payload` 唤起对应 SDK；本地测试使用 `mock-confirm`，不安装真实 SDK。
4. 支付 SDK/deep link 返回只触发服务端查询，不能直接把本地订单标记为已支付。
5. 本轮未修改任何用户端或管理后台 UI。

## 6. 上线前仍未完成

真实微信 App 支付、支付宝 App 支付、退款查询/回调证书、真实短信、实名供应商、电子签、APNs/FCM、微信/支付宝打款、渠道账单获取、生产对象存储/CDN 和正式部署配置都不在本地测试范围。
