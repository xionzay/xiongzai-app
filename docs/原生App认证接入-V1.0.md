# 熊崽电竞原生 App 认证接入 V1.0

## 1. 适用范围与兼容性

本文面向 React Native iOS/Android App。移动端使用 Bearer Access Token 和由系统安全区保存的 Refresh Token；现有 Web 用户端继续使用 HttpOnly Cookie，管理员后台认证保持不变。

移动认证本身复用现有 `auth_sessions`、`user_devices`、`sms_codes` 和 `users`，没有新增认证表。全局协议迁移已为登录增加按场景留证；App 登录前必须读取并提交当前 `LOGIN` 协议版本集合。

基础路径：`/api/v1`。生产环境只允许 HTTPS。

## 2. Token 模型

| 项目 | Access Token | Refresh Token |
| --- | --- | --- |
| 传输 | `Authorization: Bearer <token>` | 仅登录/刷新请求 JSON |
| 客户端保存 | 运行时内存 | iOS Keychain / Android Keystore |
| 服务端保存 | 不保存明文 | 仅保存带领域隔离的 HMAC-SHA256 |
| 默认生命周期 | `ACCESS_TOKEN_TTL_SECONDS`，当前默认 900 秒 | `REFRESH_TOKEN_TTL_SECONDS`，当前默认 30 天 |
| 撤销 | 每次请求通过 Session 状态实时校验 | Session 撤销、过期、用户状态异常或轮换后立即失效 |

Access Token 使用现有 HS256、issuer、user audience 和签名密钥，并包含 `sub`、`session_id`、`principal_type=user`、`token_use=access`、`iat`、`exp` 与唯一 `jti`。客户端不得信任或修改其中的用户、Session 或角色信息。

当前 PRD 的用户状态只有 `NORMAL`、`DISABLED`、`CANCELLED`；MVP 中后台“冻结/封禁用户”统一落为 `DISABLED` 并撤销全部 Session。任何非 `NORMAL` 用户都不能访问或刷新。

Refresh Token 不采用 JWT；它是高熵随机值。数据库中的 `refresh_token_hash` 不能还原明文。

## 3. 接口

### 3.1 发送验证码

继续复用：

```http
POST /api/v1/auth/sms/send
Content-Type: application/json
```

```json
{
  "phone": "<用户输入的手机号>"
}
```

验证码长度、频率、最大尝试次数、有效期和一次性消费规则与 Web 完全一致。响应不包含手机号或验证码。

### 3.2 移动端短信登录

```http
POST /api/v1/auth/mobile/sms/login
Content-Type: application/json
```

```json
{
  "phone": "<用户输入的手机号>",
  "code": "<用户输入的六位验证码>",
  "device_id": "<Keychain/Keystore 中生成并持久化的随机设备安装标识>",
  "device_name": "<系统展示设备名>",
  "platform": "IOS",
  "app_version": "<App 版本，可选>",
  "policy_version_ids": ["<GET /api/v1/policies/current?scene=LOGIN 返回的全部版本 UUID>"]
}
```

`platform` 只能为 `IOS` 或 `ANDROID`。`device_id` 是设备绑定和风险信号，不是独立认证凭证；建议首次安装生成随机 UUID 并保存在系统安全区。`device_name` 只做格式校验和客户端能力预留，当前不持久化、不参与认证，也不会作为用户身份。`policy_version_ids` 必须与当前 `LOGIN` 场景完整集合一致；验证码消费、协议留证与 Session 创建同事务完成，失败时不会创建半成品登录态。

成功响应结构：

```json
{
  "token_type": "Bearer",
  "access_token": "<服务端签发，文档不展示真实值>",
  "access_token_expires_in_seconds": 900,
  "refresh_token": "<服务端签发，文档不展示真实值>",
  "refresh_token_expires_in_seconds": 2592000,
  "session_id": "<会话 UUID>",
  "user": {
    "id": "<用户 UUID>",
    "phone_mask": "<脱敏手机号>",
    "status": "NORMAL"
  }
}
```

实际有效期以响应为准。响应不设置用户 Token Cookie，并包含 `Cache-Control: no-store` 和 `Pragma: no-cache`。

### 3.3 原子刷新

```http
POST /api/v1/auth/mobile/token/refresh
Content-Type: application/json
```

```json
{
  "refresh_token": "<Keychain/Keystore 读取的值>",
  "device_id": "<登录时相同的设备安装标识>"
}
```

服务端在同一数据库事务中锁定 Session，校验 Refresh HMAC、过期时间、撤销状态、用户状态、设备归属、平台和设备撤销状态，并用 Compare-And-Set 更新为新 HMAC。成功响应与登录 Token 响应结构一致。

规则：

- 新 Refresh Token 安全写入 Keychain/Keystore 成功后，才删除或覆盖旧值。
- 旧 Refresh Token 一旦轮换立即失效。
- 同一旧 Token 的并发请求最多一个成功，其余返回 `AUTH_REFRESH_INVALID`。
- `device_id` 不匹配不会轮换 Token，也不会泄露 Session 是否存在。
- Refresh Session 使用固定绝对过期时间，刷新不会无限延长登录状态。

### 3.4 移动端退出

```http
POST /api/v1/auth/mobile/logout
Authorization: Bearer <access_token>
```

成功返回 `204 No Content`。服务端撤销当前 Access Token 对应的 Session；App 随后必须清除内存 Access Token 和安全区 Refresh Token。

退出后再次使用原 Access/Refresh Token 返回统一 401 认证错误。重复退出不会新增第二条退出审计或产生其他副作用。

## 4. 错误码

| 错误码 | HTTP | App 处理 |
| --- | ---: | --- |
| `VALIDATION_FAILED` | 400 | 显示字段错误，不重试原请求 |
| `AUTH_SMS_CODE_INVALID` | 400 | 提示验证码错误或已使用 |
| `AUTH_SMS_CODE_EXPIRED` | 400 | 重新获取验证码 |
| `AUTH_SMS_ATTEMPTS_EXCEEDED` | 400 | 等待后重新获取验证码 |
| `AUTH_SMS_RATE_LIMITED` | 429 | 按服务端提示等待 |
| `USER_DISABLED` | 403 | 清理本地会话并展示账号状态 |
| `AUTH_REQUIRED` | 401 | 缺少或格式错误的 Bearer Header |
| `AUTH_TOKEN_INVALID` | 401 | 清理 Access Token；有 Refresh Token 时尝试一次刷新 |
| `AUTH_TOKEN_EXPIRED` | 401 | 串行执行一次刷新后重试原请求 |
| `AUTH_SESSION_INVALID` | 401 | Session/用户已失效，清理全部 Token 并回登录页 |
| `AUTH_REFRESH_INVALID` | 401 | Token 重放、撤销、过期或设备不匹配；清理全部 Token |
| `AUTH_INSECURE_TRANSPORT` | 403 | 禁止继续请求，检查 HTTPS/网关配置 |
| `POLICY_ACCEPTANCE_MISMATCH` | 409 | 重新读取 `LOGIN` 当前版本、让用户逐份确认后重试登录 |
| `POLICY_CONFIGURATION_INCOMPLETE` | 503 | 本地协议未完整发布，停止登录并联系测试环境维护者 |

错误响应继续使用平台统一结构：`code`、`message`、`request_id`、`field_errors`。错误响应不会回显 Token、验证码、完整手机号或内部 HMAC。

## 5. React Native 接入要求

1. Access Token 仅保存在认证状态容器的内存中，不写 AsyncStorage、Redux Persist、日志、崩溃报告或分析事件。
2. Refresh Token 和稳定 `device_id` 使用 iOS Keychain / Android Keystore；启用仅本机可用和合适的设备解锁策略。
3. API Client 只对业务接口添加 Bearer Header；短信发送、登录和刷新接口不附带旧 Access Token。
4. 使用单例刷新队列：多个请求同时收到过期错误时，只允许一个刷新请求，其余等待结果。
5. 刷新成功后原请求最多自动重试一次，防止无限刷新循环。
6. 刷新失败、Session 失效、用户禁用或退出时，原子清理 Access Token、Refresh Token 和登录态。
7. 禁止打印完整请求头、认证请求体和 Token 响应；网络调试器在发布构建中必须关闭或脱敏。
8. App 只连接证书有效的 HTTPS API；生产构建不得提供关闭 TLS 校验、切换 HTTP 或信任任意证书的开关。
9. `session_id` 仅用于会话展示和客服定位，不能代替 Access/Refresh Token。
10. App 切换账号时应先调用退出，再清除安全区并生成/复用符合产品策略的设备安装标识。

## 6. Web 与后台兼容基线

- `/api/v1/auth/sms/login`、`/api/v1/auth/token/refresh`、`/api/v1/auth/logout` 继续使用 Web HttpOnly Cookie。
- Cookie 写请求继续执行 Origin / Fetch Metadata CSRF 校验。
- Bearer 写请求不执行 Cookie CSRF Origin 规则，但所有身份、Session、用户状态和资源权限校验保持不变。
- `/admin-api/v1` 的管理员账号、Session、MFA、RBAC 和 Cookie/Bearer 行为没有变化。
