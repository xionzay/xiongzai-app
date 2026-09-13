# 文件存储阶段 7E：Android 模拟器原生验证报告 V1.0

日期：2026-08-24  
项目：熊崽电竞  
范围：Android Debug 首次构建、API 36 ARM64 模拟器运行、`VOICE_SAMPLE` 声音名片与本地 MinIO 全链路验证

## 1. 结论

阶段 7E 已完成 Android 本地开发环境、Android 原生工程、Debug APK、模拟器安装启动、声音文件选择、合成音频试听、客户端 SHA-256、短时预签名 PUT、服务端 `complete`、真实 MIME/大小/音轨/时长校验、隔离区待审、管理员审核、复制到私有 Bucket、业务资料绑定、短时签名播放、权限拒绝与永久拒绝、播放器/录音器生命周期和测试数据精确清理。

Android Debug 构建真实执行成功，共完成 511 个 Gradle task。APK 已安装到 Android API 36 ARM64 本地模拟器并成功启动。阶段结束前再次使用现有 APK 安装、启动并确认应用进程正常；Metro 仅监听本机回环地址。

运行中发现并修复了四类客户端边界问题：部分 Android 文件选择结果 MIME 不可靠、离线本地开发时查询被错误暂停、原生录音共享对象释放后仍可能被卸载逻辑调用、麦克风权限提示错误地覆盖声音上传状态。修复后相关静态测试、Mobile 全量测试、API 类型检查/构建和本地 PostgreSQL + MinIO 回归均通过。

本阶段没有连接阿里云 OSS、Cloudflare 或其他云服务；没有登录 Google、Google Play、Expo 或 EAS；没有创建云资源、正式签名包、AAB 或发布版本；没有购买服务或产生云费用；没有使用真实用户录音。

## 2. Android 环境

| 项目 | 实际结果 |
| --- | --- |
| Mac 架构 | Apple Silicon ARM64 |
| Android Studio | 2026.1.3 系列，Build `AI-261.26222.65.2613.16025427`，Google 官方 Apple Silicon 版本 |
| Android Studio JBR | OpenJDK 25.0.2 |
| Android SDK Platform | API 36 |
| Android Platform-Tools | 37.0.1 |
| Android Command-line Tools | 22.0 |
| Android Emulator | 37.1.11 |
| 模拟器系统 | Android API 36，ARM64-v8a，本地 AVD |
| Android NDK | 27.1.12297006 |
| Gradle Wrapper | 9.3.1 |
| Android Gradle Plugin | 8.12.0 |
| Kotlin | 2.1.20 |
| 主 Build Tools | 36.0.0 |
| 兼容 Build Tools | 35.0.0，与 36.0.0 并存 |
| 主 CMake | 3.30.5 |
| 兼容 CMake | 3.22.1，与 3.30.5 并存，用于 `react-native-screens@4.26.2` |

Android Studio、SDK、模拟器、JBR、Build Tools 和 CMake 均为本机免费开发组件；没有账号注册、订阅或付款步骤。

## 3. Android 原生工程审计

离线读取 Gradle 最终属性确认：

| 属性 | 最终值 |
| --- | --- |
| `applicationId` / namespace | `com.xiongzai.esports.dev` |
| `minSdkVersion` | 24 |
| `compileSdkVersion` | 36 |
| `targetSdkVersion` | 36 |
| `buildToolsVersion` | 36.0.0 |
| `ndkVersion` | 27.1.12297006 |

原生配置结论：

- `AndroidManifest.xml` 包含 `RECORD_AUDIO` 和音频设置权限。
- 系统文件选择由 `expo-document-picker` 提供，业务代码只接受 AAC、M4A、MP3。
- Android 32 及以下的旧存储权限带有明确 `maxSdkVersion`，API 33 及以上不依赖广泛存储权限读取用户选中的文档。
- 主 Manifest 没有全局开启明文流量；仅 Debug/DebugOptimized Manifest 为本地开发启用 cleartext，以连接宿主机本地 API/Metro。
- 没有生产网络安全例外、正式签名、Google 服务账号或发布配置。
- Android 原生工程由不带 `--clean`、带 `--no-install` 的 Expo prebuild 生成；没有覆盖已有用户代码。
- 主构建仍锁定 Build Tools 36.0.0；35.0.0 只是并存兼容组件，没有替换主版本。
- 主 CMake 3.30.5 未被修改；3.22.1 只满足个别原生子模块的兼容要求。

## 4. Android Debug 构建与运行

- 首次 Android Debug 原生编译成功，共完成 511 个 Gradle task。
- 生成 APK：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`。
- APK 大小：256,773,870 字节。
- APK 成功安装到本地 API 36 ARM64 模拟器。
- 应用成功启动，开发进程正常。
- 使用 `adb reverse` 只为本地模拟器建立开发端口转发；没有把 API、Metro、MinIO 或数据库开放到局域网或公网。
- 阶段结束复核时，API、MinIO API 和 MinIO Console 仍为回环监听；Metro 为本机 IPv6 回环监听。

构建没有生成正式签名包、AAB、Release、上传凭证或商店产物。

## 5. Android 原生声音名片验证

### 5.1 已真实验证

- Android 系统文件选择器能够选择无隐私合成 M4A 测试音频。
- Android 返回不可靠或过于宽泛的 MIME 时，客户端优先依据允许的文件名/URI 扩展名规范化 AAC、M4A、MP3 类型；仍由服务端真实内容检查作最终裁决。
- 客户端读取原生缓存文件二进制并计算 SHA-256。
- 本地播放器能够播放、暂停、停止；完整播放约 12.1 秒，暂停位置约 1.8 秒，停止后回到 0 秒。
- 客户端创建 `VOICE_SAMPLE` 上传任务，只使用服务端给出的短时 PUT 地址和允许请求头直传。
- PUT 成功后调用 `complete`；没有重复 PUT。
- 服务端重新读取对象并校验真实大小、SHA-256、真实 MIME、音轨和权威时长，权威时长约 12.07 秒。
- 完成后文件保持在 quarantine，进入待审核状态，没有自动公开或自动绑定业务资料。
- 管理员本地审核通过后，对象从 quarantine 精确复制到 private Bucket，并建立声音名片业务绑定。
- 审核通过的私有声音按需申请短时签名地址，Android 原生播放器可受控播放、暂停、停止。
- 短时地址到期后播放控件被清除；地址没有写入持久化存储。
- 页面离开后播放器和录音器相关共享对象安全释放，没有出现释放后再次访问原生对象的错误。

### 5.2 权限路径验证

- 首次拒绝麦克风权限时显示明确提示。
- 再次拒绝并进入永久拒绝状态后，不重复弹出系统授权框，提供“打开系统麦克风设置”入口。
- 权限提示不会把已有待上传、待审核、已通过或已绑定声音状态改写为失败。
- 权限状态复核后已恢复到未决定状态，避免本阶段人为拒绝污染后续真实设备测试。

### 5.3 自动化测试覆盖

- 10–30 秒客户端预检，10 秒前禁止完成录音，30 秒自动停止。
- 暂停、继续、停止、取消和卸载状态机。
- 文件读取、哈希、PUT 的取消信号传播。
- PUT 成功而 `complete` 暂时失败时只重试 `complete`。
- 上传恢复不持久化或复用过期 PUT 地址。
- 替换、取消、失败和页面离开只删除本流程创建的临时文件。
- 播放 URL 切换时先移除订阅，再释放旧播放器。
- 本地开发 API 可用但公网不可达时，React Query 仍允许访问回环 API；生产环境继续要求真实网络可达。
- Web 选择和播放分支保持存在并回归通过。

### 5.4 尚未宣称通过

- 没有使用真实用户录音，因此没有把真实麦克风采集音质、噪声、音频路由或现场录音上传写成通过。
- Android Emulator 的虚拟麦克风不能替代真实 Android 手机的麦克风、蓝牙耳机、听筒/扬声器切换和系统中断测试。
- 没有验证锁屏、来电、耳机插拔、后台切换和低内存回收等真实硬件场景。
- 没有连接真实 Android 手机，也没有执行 Google Play 发布或正式签名。

## 6. 本地 MinIO 全链路

本次合成测试声音执行的真实链路：

1. Android 选择本地合成 M4A；
2. 客户端读取二进制并计算 SHA-256；
3. API 创建 `VOICE_SAMPLE` 上传任务；
4. API 生成短时预签名 PUT；
5. Android 直传 quarantine Bucket；
6. Android 调用 `complete`；
7. 服务端验证大小、摘要、真实 MIME、音轨和权威时长；
8. 文件进入待审核状态；
9. 管理员审核通过；
10. 服务端复制到 private Bucket并清理旧隔离位置；
11. 业务资料绑定已审核文件；
12. 客户端申请短时 GET 并受控播放；
13. 到期、离开页面和停止时清理内存地址及播放器资源。

完整签名地址、签名查询参数、完整对象键、本地文件 URI、音频字节和认证信息均未写入本报告、Git 或客户端持久化存储。

## 7. 发现并修复的问题

### 7.1 Android 文件 MIME 兼容

系统文件选择器可能把 M4A/AAC 返回为宽泛或错误 MIME。声音上传域现在只在允许列表内，优先使用可信文件扩展名规范化类型；服务端真实 MIME 仍为最终依据。

### 7.2 本地离线查询状态

开发环境只有回环 API、没有公网时，网络状态库可能错误暂停 React Query。新增环境边界：开发环境允许本地 API 查询，生产环境仍同时要求网络连接和互联网可达。

### 7.3 原生录音器卸载竞态

Expo 共享对象可能先由原生层释放，React 卸载清理再调用其方法会抛错。修复后卸载只精确清理最新的本流程缓存文件，不再对已经释放的录音共享对象调用方法。

### 7.4 权限提示污染上传状态

麦克风权限拒绝原来可能复用通用消息回调并覆盖上传阶段。修复后权限提示只更新权限相关消息，不改变文件上传、审核或绑定事实。

## 8. 测试结果

| 检查 | 结果 |
| --- | --- |
| Android Debug 原生构建 | 通过，511 个 Gradle task |
| APK 安装与启动 | 通过 |
| Android API 36 ARM64 模拟器 | 启动并被 `adb` 识别 |
| Mobile TypeScript | 通过 |
| Mobile ESLint | 通过 |
| Mobile 全量测试 | 113/113 通过，失败 0、跳过 0 |
| Web 音频回归 | 通过，包含在 Mobile 全量测试 |
| 原生平台静态测试 | 通过，包含权限、录音生命周期、上传取消、complete 重试、恢复和播放生命周期 |
| API TypeScript | 通过 |
| API build | 通过 |
| API 本地 PostgreSQL + MinIO 串行回归 | 79/79 通过，失败 0、跳过 0 |
| Git diff 格式检查 | 通过 |

工作区依赖在最终复核期间由 pnpm 使用同一 frozen lockfile 从本机内容寻址缓存重建；实际下载量为 0，依赖版本没有升级或新增。重建后再次运行 Mobile TypeScript、ESLint、113 项测试、API TypeScript 和 API build，全部通过。

## 9. 安全检查

- `.env.backend.local`、`.env.minio.local`、MinIO 许可证和 `.local/minio-data` 均被 Git 忽略。
- 真实环境文件和许可证权限均为 `600`。
- Git 跟踪的上述敏感文件数量为 0。
- `apps/mobile/package.json` 和 `pnpm-lock.yaml` 在阶段结束时哈希与安装前一致，没有依赖漂移。
- 阶段 7E 临时审核、查询和清理脚本剩余数量为 0。
- 未把签名 URL、对象键、本地 URI、数据库连接、Secret、许可证内容、设备标识或音频字节写入代码、文档或 Git。
- 没有登录外部账号、连接云服务、创建云资源、绑定域名或购买服务。
- MinIO、API、Metro 和数据库保持本地回环边界。

## 10. 阶段 7E 直接修改

- `apps/mobile/src/features/files/voice-upload-domain.ts`：处理 Android 文件选择 MIME 不可靠但扩展名受允许列表约束的情况。
- `apps/mobile/src/features/files/voice-recorder-panel.native.tsx`：避免卸载时调用已由原生层释放的录音共享对象。
- `apps/mobile/src/features/files/voice-upload-slot.tsx`：隔离权限提示与文件上传/审核/绑定状态。
- `apps/mobile/src/query/query-lifecycle-sync.tsx`：按环境同步 React Query 在线状态。
- `apps/mobile/src/query/query-online-state.ts`：新增开发回环 API 与生产公网可达性的判定边界。
- `apps/mobile/tests/file-upload.test.ts`：增加 Android MIME 与权限提示状态回归。
- `apps/mobile/tests/native-voice-media.test.ts`：增加录音器/播放器释放顺序和权限路径回归。
- `apps/mobile/tests/query-lifecycle-sync.test.ts`：增加开发与生产在线状态回归。
- `apps/mobile/android`：Expo 生成的本地 Android 原生工程及 Debug 构建物，按项目规则受 Git 忽略。
- `docs/文件存储-阶段7E-Android模拟器原生验证报告-V1.0.md`：本报告。

工作区原有其他未提交和未跟踪修改全部保留；没有执行 reset、clean、checkout、restore 或 `prebuild --clean`。

## 11. 测试数据清理

用户已明确授权删除本阶段合成声音测试记录和对象，清理已精确完成：

- 当前私有对象和生命周期中记录的旧隔离对象均已删除，并逐一确认不存在；共确认 2 个对象位置不存在。
- 声音名片业务绑定和权威时长引用已清除。
- 本阶段文件用途、生命周期任务、文件记录、临时管理员 Session 和临时角色已删除。
- Android 模拟器下载目录中仅匹配本阶段标记的合成音频副本已删除，复核剩余数量为 0。
- 没有清空或删除任何 Bucket，没有批量删除其他文件或用户数据，没有删除下载目录许可证。

管理员操作日志使用数据库不可变追加策略，不能删除。本阶段保留 1 条不可变审核日志及其必须的管理员外键占位记录。该占位管理员已禁用，没有 Session、角色或权限，密码字段为不可登录占位值；保留它是为了维护审计链和外键完整性，不构成可用账号。

## 12. 费用与外部操作

| 项目 | 结果 |
| --- | --- |
| Android Studio / SDK / Emulator | 本地免费组件 |
| Google / Google Play 登录 | 未使用 |
| Expo / EAS 登录或云构建 | 未使用 |
| 阿里云 OSS / Cloudflare | 未连接 |
| 云资源 | 未创建 |
| 付款信息 | 未填写 |
| 本阶段费用 | 0 元 |
| 域名 / CDN / 付费扫描 | 未购买、未绑定 |

## 13. 尚未完成与下一阶段建议

文件存储的软件实现、本地 MinIO、Web、iOS Simulator 和 Android Emulator 主要链路已经完成。继续保持本地开发、零云费用时，建议下一步二选一：

1. **文件存储阶段 7F：Android 实机本地验收**。使用一台 Android 手机验证真实麦克风、权限首次/永久拒绝、蓝牙/扬声器路由、来电/后台中断、10–30 秒真实录音和本地 API 全链路。该阶段可保持 0 元，但需要用户提供 Android 手机、USB 数据线并本人确认 USB 调试；不得使用真实个人内容，可录制无隐私测试语音。
2. **文件存储阶段 8：本地跨平台最终收尾**。如果暂时没有 Android/iPhone 实机，则把实机项登记为上线前阻塞项，完成文档一致性、管理员审核、清理任务、Web/iOS/Android 自动化和本地运行手册的最终总验收。该阶段不需要账号或费用。

真实阿里云 OSS 联调应继续推迟到准备部署测试环境时单独授权。届时才可能产生 OSS 存储、请求、外网流量、CDN 或内容安全按量费用；本阶段没有发生这些费用。

阶段 7E 完成后停止，不自动连接真实设备，不进入阿里云 OSS，不创建云资源，不执行发布构建。
