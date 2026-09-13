# 文件存储阶段 7C：iOS 模拟器原生验证报告 V1.0

日期：2026-08-23  
项目：熊崽电竞  
范围：iOS Simulator 原生构建、`VOICE_SAMPLE` 声音名片运行验证与本地 MinIO 全链路测试

## 1. 结论

阶段 7C 的 iOS 原生构建、本地开发版启动、系统文件选择、合成音频本地试听、客户端 SHA-256、短时预签名 PUT、服务端 `complete`、真实 MIME/大小/音轨/时长校验、隔离区待审、上传恢复、短时签名试听、播放器离开页面释放和本阶段测试数据精确清理已经在本机 iOS Simulator 真实执行成功。

运行中发现并修复了一个 `expo-audio` 原生播放器生命周期问题：播放器释放后，React 渲染仍可能读取原生共享对象的 `currentStatus`，从而抛出“native shared object 已不存在”的异常。修复后改为单一 `playbackStatusUpdate` 订阅驱动状态，在 URL 变化和卸载时先移除订阅，再暂停并释放播放器；重新申请短时地址后，模拟器已真实播放至 3.5 秒、停止回到开头并离开页面，Metro 未再出现该异常。

本阶段没有连接真实 iPhone、Android、阿里云 OSS、Cloudflare 或其他云服务；没有登录 Apple Developer、Expo 或 EAS；没有创建云资源、证书、Provisioning Profile、IPA 或归档；没有购买服务或产生云费用；没有使用真实用户录音或个人音频。

## 2. 环境审计

| 项目 | 结果 |
| --- | --- |
| CPU 架构 | Apple Silicon `arm64` |
| macOS | 26.5.2 |
| Xcode | 26.6（Build 17F113） |
| iOS Simulator Runtime | iOS 26.5 |
| Simulator | iPhone 17 Pro |
| CocoaPods | 1.16.2，项目本地安装，无 `sudo`、无全局 Ruby/Homebrew 修改 |
| Node.js | 24.19.0（Codex 工作区运行时） |
| pnpm | 11.19.0 |
| Expo CLI / SDK | CLI 57.0.17；项目使用 Expo SDK 57 |
| 磁盘 | 原生生成、Pods 和 Debug 构建均已成功完成，未出现空间阻塞 |

## 3. 原生项目生成与依赖

- 阶段开始时 `apps/mobile/ios` 不存在需要保护的手写原生工程；执行了不带 `--clean` 的 iOS prebuild。
- `apps/mobile/ios` 已生成，并由 `apps/mobile/.gitignore` 忽略；没有把派生原生构建物、Pods、密钥或许可证提交到 Git。
- `pod install` 成功；使用项目本地 CocoaPods，不要求账号、付款、管理员密码或系统级安装。
- 实际音频依赖保持 Expo SDK 57 兼容版本：
  - `expo-audio` 57.0.4；MIT
  - `expo-document-picker` 57.0.1；MIT
  - `expo-file-system` 57.0.5；MIT
  - `expo-asset` 57.0.13；MIT
- 生成的 `Info.plist` 包含中文麦克风用途说明。
- `expo-audio` 配置允许前台录音，明确关闭后台录音和后台播放。
- 未发现 `UIBackgroundModes`；未增加定位、联系人、蓝牙等与本阶段无关的权限。
- Development Build 在 iOS Simulator 构建、安装并启动成功，不涉及生产签名。

## 4. iOS 原生编译结果

原生 Debug/Development Build 通过，应用成功安装并启动到 iPhone 17 Pro（iOS 26.5）模拟器。构建过程没有要求 Apple Developer 登录、证书或付费会员。

非阻塞警告：

- 链接参数存在重复 `-lc++` 警告；
- 个别 CocoaPods/React Native 脚本阶段无法依据输出文件自动判断是否需要重复运行。

以上警告未阻塞构建和运行，不是声音名片业务错误；本阶段未扩大范围重构原生构建系统。

## 5. 真实 iOS Simulator 运行验证

### 5.1 已真实验证

- 应用正常启动，并使用本地合成测试身份进入陪玩申请资料页面。
- 系统文件选择器能够打开；取消选择后返回页面，没有创建新上传任务。
- 从系统文件中选择无隐私合成 M4A 成功；客户端读到约 12.0 秒、约 41 KiB。
- 本地播放器可播放、暂停、停止，并在停止后回到 0 秒。
- 麦克风权限拒绝路径显示安全提示；永久拒绝路径提供打开系统设置入口。
- 使用合成音频执行客户端读取与 SHA-256，随后创建上传任务、使用服务端短时 PUT 地址直传并调用 `complete`。
- 对象存储 PUT 没有附带登录 `Authorization`；客户端没有决定 Bucket 或对象键。
- 服务端真实校验大小、SHA-256、真实 MIME、音轨与时长后，文件进入 `VERIFIED / PENDING / SIGNED`，服务端权威时长约 12.1 秒。
- 文件保持在 quarantine，未自动公开、未自动审核通过、未绑定业务资料。
- 应用重载后找回等待审核任务，没有重复 PUT，也没有复用旧 PUT 地址。
- 重新申请短时试听地址后，原生播放器真实播放到 3.5 秒；停止回到 0 秒；离开页面后没有再访问已释放原生对象。
- 短时试听地址仅保存在组件内存，页面/文件变化或到期时清除；没有写入持久化存储。

### 5.2 仅由静态/自动化测试验证

- 文件选择器只声明 AAC、M4A、MP3 类型，并把系统选择结果复制到应用拥有的缓存文件。
- 10–30 秒客户端时长策略、10 秒前禁止完成录音、30 秒自动停止。
- 录音暂停/继续状态机、取消录音与卸载时精确清理本次缓存文件。
- 读取阶段、哈希阶段和 PUT 阶段取消时的 `AbortSignal` 传播。
- PUT 成功但 `complete` 暂时失败后，只重试 `complete`，不重复 PUT。
- 恢复逻辑不会持久化或复用过期 PUT 地址。
- 替换音频、上传失败、页面离开时只清理本流程拥有的临时文件。
- Web 文件选择与 `<audio>` 播放分支保留且回归通过。
- 服务端注入 Provider 覆盖精确 10/30 秒接受、9/31 秒拒绝和伪装音频拒绝。

### 5.3 尚未真实验证或受模拟器限制

- iOS Simulator 未提供可依赖的真实麦克风输入，因此没有把“录音、暂停、继续、停止、取消”写成真实录音通过；只真实验证了权限拒绝与设置引导。
- 小于 10 秒和大于 30 秒音频的系统文件选择运行验证尚未作为最终通过项；服务端边界和客户端策略已有自动化覆盖。
- 没有在真实运行中故障注入“读取中取消、哈希中取消、PUT 中取消、complete 网络暂时失败”；这些路径由单元/集成测试覆盖。
- 没有等待短时试听地址自然过期后再次播放；已静态验证到期定时清除，运行时验证了页面离开清除和重新申请。
- 未连接真实 iPhone，因此麦克风、硬件音频路由、来电/锁屏中断、后台切换等仍需以后单独验证。

## 6. 本地 MinIO 与 API 全链路

本地服务保持回环监听：PostgreSQL、API、Metro、MinIO API 和 MinIO Console 均未开放到局域网或公网。三个开发 Bucket 保持存在，未删除 Bucket，也未修改匿名访问策略。

本次真实上传链路：

1. 选择本地合成测试音频；
2. 客户端读取二进制并计算 SHA-256；
3. API 创建 `VOICE_SAMPLE` 上传任务；
4. 服务端返回短时 PUT 访问；
5. 客户端仅使用服务端地址和允许请求头直传；
6. PUT 成功后调用 `complete`；
7. 服务端重新读取对象并验证大小、摘要、真实 MIME、音轨与权威时长；
8. 文件保留在隔离区并进入待审核状态；
9. 所有者可按需申请短时签名试听；
10. 未审核文件没有进入公开 Bucket，也没有建立业务引用。

报告、日志和测试输出均不记录完整签名地址、查询参数、完整对象键、本地文件 URI、音频字节或认证凭证。

## 7. 测试结果

| 检查 | 结果 |
| --- | --- |
| Mobile TypeScript | 通过 |
| 本阶段原生音频文件定向 ESLint | 通过 |
| Mobile 全量测试 | 111/111 通过 |
| 原生声音专项测试 | 13/13 通过 |
| iOS 原生编译 | 通过 |
| Development Build 启动 | 通过 |
| Web 音频回归 | 通过，包含在 Mobile 全量测试 |
| API TypeScript / build | 通过 |
| API 本地 PostgreSQL + MinIO 回归 | 79/79 通过 |
| Git diff 格式检查 | 通过 |

API 集成测试第一次在受限沙箱中运行时，本地套接字被 `EPERM` 拒绝；取得仅访问回环 PostgreSQL/MinIO 的执行权限后，以相同代码和配置串行复跑 79/79 通过。该次 `EPERM` 是执行沙箱限制，不是业务测试失败。

## 8. 安全检查

- `.env.backend.local`、`.env.minio.local` 和本地 MinIO 许可证均被 Git 忽略，文件权限为 `600`。
- Mobile 生产源码/测试目标没有 `console.log/debug/info/warn/error`。
- 没有发现预签名地址写入 `AsyncStorage` 或 `SecureStore`。
- 配置示例中的存储密钥字段为占位符，不是真实密钥。
- 未读取或输出许可证内容、数据库连接字符串、MinIO Root 凭证、Session、Cookie、Authorization、设备标识或音频原始字节。
- 没有把完整签名 URL、查询参数、对象键或本地文件 URI写入报告。
- 没有开放 MinIO、API、PostgreSQL 或 Metro 到局域网/公网。

## 9. 阶段 7C 直接修改

- `apps/mobile/src/features/files/file-upload-api.ts`：确保原生 SHA-256 输入具有稳定的 `ArrayBuffer` backing。
- `apps/mobile/src/features/files/voice-upload-slot.tsx`：保留准确的最后上传阶段，用于安全、阶段化错误提示与恢复。
- `apps/mobile/src/features/files/voice-upload-domain.ts`：补充不泄露地址、路径和对象信息的阶段化声音上传错误文案。
- `apps/mobile/src/features/files/voice-audio-controls.native.tsx`：修复 `expo-audio` 共享对象释放后的状态读取竞态，改为单一事件订阅和明确清理顺序。
- `apps/mobile/tests/native-voice-media.test.ts`：增加播放器 URL 切换、单订阅、先移除订阅再释放以及禁止直接读取 `currentStatus` 的回归约束。
- `apps/mobile/ios`：由 Expo prebuild 生成的本地 iOS 原生工程和 Pods；整个目录受 Git 忽略。
- `docs/文件存储-阶段7C-iOS模拟器原生验证报告-V1.0.md`：本报告。

工作区原有其他未提交和未跟踪修改全部保留；没有执行 reset、clean、checkout、restore 或 `prebuild --clean`。

## 10. 测试数据与清理

- 自动化文件存储测试使用独立临时 Schema 和唯一对象，并通过测试 `finally` 精确清理。
- 本次模拟器使用的音频为系统语音合成的无隐私测试内容，不是用户录音或商业音乐。
- 边界验证临时音频只用于本机；不加入 Git，不上传云端。
- 已取得用户即时确认，并通过应用中的“删除未绑定声音名片”精确删除本阶段创建的一条待审核合成声音记录和对应隔离对象；应用随后回到“请选择声音名片”，不再显示该待审核任务。
- 删除完成后只读列出 quarantine Bucket，结果为 0 个对象且未截断，确认本阶段隔离对象已清除；没有清空或删除任何 Bucket，也没有批量删除其他数据库数据。
- 已精确删除模拟器内 4 个 Stage 7C 合成音频副本和 `/private/tmp` 内 4 个本阶段临时音频文件；复核剩余数量均为 0。未删除下载文件夹中的许可证或其他用户文件。
- 本阶段启动的 Metro、API 和防休眠进程已经停止；本地 MinIO 与 PostgreSQL 保持原有回环监听，未停止、未开放网络、未修改其数据或配置。

## 11. 费用与外部操作

| 项目 | 结果 |
| --- | --- |
| Apple Developer 登录/会员 | 未使用 |
| Expo/EAS 登录或云构建 | 未使用 |
| 阿里云 OSS / Cloudflare | 未连接 |
| 云资源 | 未创建 |
| 付款信息 | 未填写 |
| 本阶段费用 | 0 元 |
| 域名/CDN/付费扫描 | 未购买、未绑定 |

Xcode、iOS Simulator、本地 Development Build、MinIO 本机开发和本地 PostgreSQL 测试本阶段均不要求 Apple Developer 付费会员。

## 12. 下一阶段建议

在本地开发优先、继续零云费用的前提下，建议下一步拆成独立授权：

1. Android 模拟器原生构建与声音名片验证；需要确认 Android SDK、模拟器和 `adb` 状态，API 若使用宿主机回环地址通常需要 Android Emulator 的宿主机映射或 `adb reverse`。不要在未授权时执行 Android prebuild/run。
2. 真实 iPhone 本地验证；用于麦克风录音、权限首次/永久拒绝、硬件播放与中断测试。可能需要免费 Apple ID 个人签名；只有发布到 App Store、TestFlight 或需要受限能力时才可能需要付费 Apple Developer 会员，执行前必须重新确认。
3. 真实网络故障注入；为读取、哈希、PUT、complete 和短时地址过期建立可控的本地测试代理或注入点，仍可不连接云端。
4. 所有本地平台稳定后，再单独评估阿里云 OSS 联调；该阶段可能产生 OSS 存储、请求、外网流量、CDN 或内容安全按量费用，必须在创建资源和填写付款信息前再次授权。

阶段 7C 完成后停止，不自动执行 Android、不连接真实 iPhone、不登录任何账号，也不进入阿里云 OSS 联调。
