# 熊崽电竞原生 App

使用 React Native、TypeScript、Expo SDK 57 Development Build、Expo Router 和 TanStack Query。阶段 1–9 历史链路与新增店铺/商品链路不等同于全产品真机验收。最新工程结果和阻断见 [2026-10 收尾报告](../../docs/frontend-final-2026-10-12/验收报告.md)、`docs/prd-route-api-test-matrix.md` 与 `docs/pre-release-runbook.md`。

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

只有原生目录不存在或已经另行完整备份时，才首次生成原生工程：

```bash
pnpm --filter @xiongzai/mobile prebuild
```

注意：Expo 非交互预构建可能自动清理被判定为格式异常的原生目录，即使没有传入 `--clean`。已有 `ios`/`android`、签名配置与构建产物必须先单独备份；本轮不再对原工作区执行预构建清理。

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
- 头像可通过系统相册或相机裁剪与压缩；图片及声音名片使用真实上传策略、预签名 PUT、complete 和审核，已具备本地 MinIO 测试链路，但不代表生产存储/CDN 已接通。不生成假 `file_id`，本地 URI 不当作公开文件地址。
- 手机号换绑、数据下载任务和账号注销在本轮产品范围内主动关闭，仅展示“暂未开放”；底层历史实现保留，但实际路由不加载这些任务接口。
- 聊天当前使用真实 HTTP 持久化与受控前台轮询，尚无 WebSocket 实时网关。
- 系统推送、Universal Link/App Link、真实支付/打款和生产签名未接入。
