# 熊崽电竞原生 App

阶段 1–9 使用 React Native、TypeScript、Expo SDK 57 Development Build、Expo Router 和 TanStack Query，已覆盖认证、发现、交易、售后、消息、账户安全、陪玩经营和财务主链路。真实完成度和发布阻断见 `docs/prd-route-api-test-matrix.md` 与 `docs/pre-release-runbook.md`。

## 本地配置

复制 `.env.example` 为 `.env.local`，根据运行目标设置 API 地址：

- iOS 模拟器：`http://127.0.0.1:3002/api/v1`
- Android 模拟器：`http://10.0.2.2:3002/api/v1`
- 真机：使用开发电脑在局域网中的 IP
- 生产构建：必须使用 `https://`，否则配置阶段直接失败
- Mock 支付：只有非生产环境显式设置 `EXPO_PUBLIC_ENABLE_MOCK_PAYMENT=true` 才显示；生产构建会拒绝该开关

不要把真实密钥或 Token 写入任何 `EXPO_PUBLIC_*` 变量。

## 运行

在仓库根目录执行：

```bash
pnpm mobile:ios
pnpm mobile:android
```

首次生成原生工程也可以执行：

```bash
pnpm --filter @xiongzai/mobile prebuild
```

启动已经安装好的 Development Build：

```bash
pnpm mobile:start
```

## 验证

```bash
pnpm mobile:typecheck
pnpm mobile:test
pnpm mobile:lint
pnpm mobile:doctor
pnpm --filter @xiongzai/mobile exec expo config --type public
```

## 认证安全边界

- Access Token 只存在 `TokenVault` 运行时内存中。
- Refresh Token 和稳定 `device_id` 使用 Expo SecureStore（Keychain/Keystore）。
- 不使用 AsyncStorage、日志、错误或测试输出保存认证秘密。
- 401 刷新使用单例队列；刷新后的原请求最多重试一次。
- 退出登录和认证失效会清除全部 Session 凭据，但保留稳定设备标识。

## 当前能力边界

- 资料更新同时提交用户 `version` 与资料 `version`；冲突后读取服务端最新资料，不覆盖其他设备修改。
- 隐私开关以服务端版本为准，失败会回滚并重新读取。
- Session 列表仅展示后端脱敏设备摘要；撤销当前 Session 会立即清理本地认证。
- 头像可通过系统相册或相机进行 1:1 裁剪与压缩；服务端上传接口未开放前仅作本地预览，不生成 `file_id`。
- 手机号换绑、数据下载任务和账号注销接口未开放，App 只展示明确说明，不伪造完成状态。
- 聊天当前使用真实 HTTP 持久化与受控前台轮询，尚无 WebSocket 实时网关。
- 系统推送、Universal Link/App Link、真实支付/打款和生产签名未接入。
