import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { EvidencePreviewSession, type EvidenceAccess, type EvidencePreviewState } from "../src/features/checkout/evidence-preview-session";
import { resolveApiBaseUrl } from "../src/api/config";

const files = [{ file_id: "image", kind: "IMAGE" }, { file_id: "video", kind: "VIDEO" }];
const grant = (id = "video", ttl = 60_000): EvidenceAccess => ({ id, file_type: id === "video" ? "ORDER_FULFILLMENT_VIDEO" : "ORDER_FULFILLMENT_IMAGE", mime_type: id === "video" ? "video/mp4" : "image/png", visibility: "PRIVATE", upload_status: "VERIFIED", moderation_status: "APPROVED", access: { url: "http://127.0.0.1:9000/private/synthetic?signature=memory-only", expires_at: new Date(Date.now() + ttl).toISOString() } });
const fixture = (request: ConstructorParameters<typeof EvidencePreviewSession>[2]) => {
  const states: EvidencePreviewState[] = [];
  const session = new EvidencePreviewSession("order-one", files, request, state => states.push(state));
  return { session, states, latest: () => states.at(-1)! };
};

test("原生图片加载占位图使用当前已确认图标，资源存在且保留可访问名称", () => {
  const require = createRequire(import.meta.url);
  const assetModule = { exports: {} as { jellyAssets: Record<string, string> }, require: (name: string) => {
    assert.match(name, /^\.\.\/\.\.\/assets\/[a-z0-9-]+\/[^/]+\.png$/);
    const path = new URL(name, new URL("../src/components/jelly-assets.ts", import.meta.url));
    const bytes = readFileSync(path); assert.equal(bytes.subarray(1, 4).toString(), "PNG"); return { __esModule: true, default: path.href };
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/jelly-assets.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, assetModule);
  const context = { exports: {} as { JellyIcon: (props: { kind: string; label?: string }) => { type: string; props: { source: string; accessible: boolean; accessibilityLabel?: string } } }, require: (name: string) => name === "react-native" ? { Image: "Image", Text: "Text" } : name === "./jelly-assets" ? assetModule.exports : require(name) };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/jelly-icon.tsx", import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);
  const more = context.exports.JellyIcon({ kind: "more", label: "图片加载中" });
  assert.equal(more.type, "Image");
  assert.match(more.props.source, /\/more\.png$/);
  assert.equal(more.props.source, assetModule.exports.jellyAssets.more);
  assert.equal(more.props.accessible, true);
  assert.equal(more.props.accessibilityLabel, "图片加载中");
  assert.equal(context.exports.JellyIcon({ kind: "image" }).props.source, assetModule.exports.jellyAssets.image);
  assert.equal(context.exports.JellyIcon({ kind: "image" }).props.accessible, false);
  assert.match(readFileSync(new URL("../src/components/file-image.tsx", import.meta.url), "utf8"), /query\.isPending && fileId \? "more" : "image"/);
});

test("iOS 播放器保持当前 Expo SDK 的官方兼容版本和源码集成，不开启后台播放", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const require = createRequire(import.meta.url);
  const sdkVersions = require("expo/bundledNativeModules.json");
  assert.deepEqual(manifest.expo.autolinking.ios.buildFromSource, ["expo-video"]);
  assert.equal(manifest.dependencies["expo-video"], sdkVersions["expo-video"]);
  assert.equal(manifest.dependencies["react-native"], sdkVersions["react-native"]);
  assert.match(manifest.dependencies.expo, /^~57\./);
  const config = readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
  assert.match(config, /supportsBackgroundPlayback: false/);
  assert.match(config, /supportsPictureInPicture: false/);
});

test("无权限、失效会话和不可用文件没有访问地址，错误不回显原始异常", async () => {
  for (const status of [401, 403, 404, 409]) {
    const f = fixture(async () => { throw Object.assign(new Error(grant().access.url), { status }); });
    await f.session.open("video"); assert.equal(f.latest().url, null); assert.equal(f.latest().phase, "error");
    assert.doesNotMatch(f.latest().message, /signature|http/); f.session.dispose();
  }
});
test("未知凭证不能请求；图片和视频同样要求真实私有已审核用途", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return grant(); });
  await f.session.open("unknown"); assert.equal(calls, 0);
  for (const change of [{ visibility: "PUBLIC" }, { moderation_status: "PENDING" }, { file_type: "PRODUCT_IMAGE" }, { id: "other" }, { mime_type: "audio/mp4" }]) {
    const denied = fixture(async () => ({ ...grant(), ...change })); await denied.session.open("video"); assert.equal(denied.latest().url, null); denied.session.dispose();
  }
  const image = fixture(async () => grant("image")); await image.session.open("image"); assert.equal(image.latest().kind, "IMAGE"); assert.equal(image.latest().phase, "ready"); image.session.dispose(); f.session.dispose();
});
test("链接到期清空内存；手动刷新重新访问服务端，不无限重试旧地址", async () => {
  let calls = 0;
  const f = fixture(async () => grant("video", ++calls === 1 ? 35 : 60_000));
  await f.session.open("video"); assert.equal(f.latest().phase, "ready");
  await new Promise(resolve => setTimeout(resolve, 60)); assert.equal(f.latest().phase, "error"); assert.equal(f.latest().url, null); assert.equal(calls, 1);
  await f.session.retry(); assert.equal(calls, 2); assert.equal(f.latest().phase, "ready"); f.session.dispose();
});
test("过期、缺失期限和危险 URL 不可交给播放器", async () => {
  for (const access of [{ ...grant().access, expires_at: "2000-01-01" }, { ...grant().access, expires_at: null }, { ...grant().access, url: "https://user:secret@example.invalid/media" }, { ...grant().access, url: "file:///private" }]) {
    const f = fixture(async () => ({ ...grant(), access })); await f.session.open("video"); assert.equal(f.latest().url, null); f.session.dispose();
  }
});
test("网络异常有真实重试，播放失败清空地址再取新权限", async () => {
  let calls = 0;
  const f = fixture(async () => { if (++calls === 1) throw new TypeError("offline"); return grant(); });
  await f.session.open("video"); assert.match(f.latest().message, /网络/); await f.session.retry(); assert.equal(f.latest().phase, "ready");
  f.session.fail(); assert.equal(f.latest().url, null); await f.session.retry(); assert.equal(calls, 3); f.session.dispose();
});
test("切换订单取消旧请求；即使旧请求忽略取消也不能播放旧凭证", async () => {
  let resolve!: (value: EvidenceAccess) => void, signal!: AbortSignal;
  const f = fixture((_path, current) => { signal = current; return new Promise(done => { resolve = done; }); });
  const pending = f.session.open("video"); f.session.setContext("order-two", files); assert.equal(signal.aborted, true);
  resolve(grant()); await pending; assert.equal(f.latest().url, null); assert.equal(f.latest().phase, "idle"); assert.equal(f.latest().orderId, "order-two"); f.session.dispose();
});
test("返回页面、后台、卸载均取消请求和期限，迟到响应不更新页面", async () => {
  for (const action of ["close", "fail", "dispose"] as const) {
    let resolve!: (value: EvidenceAccess) => void, signal!: AbortSignal;
    const f = fixture((_path, current) => { signal = current; return new Promise(done => { resolve = done; }); });
    const pending = f.session.open("video"); f.session[action](); const length = f.states.length;
    assert.equal(signal.aborted, true); resolve(grant()); await pending; assert.equal(f.states.length, length); assert.equal(f.latest().url, null); f.session.dispose();
  }
});
test("播放器组件默认不播放、不缓存，卸载释放资源，初始化失败不泄露异常", () => {
  const require = createRequire(import.meta.url), effects: (() => (() => void))[] = [], calls: string[] = [], states: unknown[] = [];
  let index = 0, listener!: (status: { status: string }) => void, failure = 0, creationFails = false;
  const player = { addListener(_name: string, fn: typeof listener) { listener = fn; return { remove() { calls.push("unsubscribe"); } }; }, pause() { calls.push("pause"); }, release() { calls.push("release"); }, staysActiveInBackground: true, showNowPlayingNotification: true };
  const moduleContext = { queueMicrotask: (fn: () => void) => fn(), exports: {} as { EvidenceVideo: (props: object) => unknown }, require: (name: string) => name === "react" ? { useState(initial: unknown) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (value: unknown) => { states[i] = value; }]; }, useEffect(fn: typeof effects[number]) { effects.push(fn); } } : name === "expo-video" ? { VideoView: "VideoView", createVideoPlayer(source: { useCaching: boolean }) { assert.equal(source.useCaching, false); if (creationFails) throw new Error(grant().access.url); return player; } } : name === "react-native" ? { View: "View", Text: "Text", ActivityIndicator: "ActivityIndicator", StyleSheet: { create: (x: object) => x } } : name === "@/theme/tokens" ? { colors: {}, radii: {}, spacing: {}, typography: {} } : require(name) };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/features/checkout/evidence-video.tsx", import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, moduleContext);
  moduleContext.exports.EvidenceVideo({ url: grant().access.url, onFailure: () => { failure++; } });
  const cleanup = effects[0]!(); assert.equal(player.staysActiveInBackground, false); assert.equal(player.showNowPlayingNotification, false);
  listener({ status: "error" }); assert.equal(failure, 1); cleanup(); listener({ status: "error" }); assert.equal(failure, 1);
  assert.deepEqual(calls, ["unsubscribe", "pause", "release"]);
  creationFails = true;
  moduleContext.exports.EvidenceVideo({ url: grant().access.url, onFailure: () => { failure++; } });
  const failedCleanup = effects[1]!(); assert.equal(failure, 2); failedCleanup();
  assert.deepEqual(calls, ["unsubscribe", "pause", "release"]);
});
test("短时地址不进入持久化、日志、缓存或外部浏览器；页面与后台离开清理已接线", () => {
  for (const name of ["evidence-preview-session.ts", "evidence-video.tsx", "fulfillment-evidence.tsx"]) {
    const source = readFileSync(new URL("../src/features/checkout/" + name, import.meta.url), "utf8");
    assert.doesNotMatch(source, /console\.|openURL|AsyncStorage|SecureStore|setQueryData|captureException|useCaching: true/);
  }
  const ui = readFileSync(new URL("../src/features/checkout/fulfillment-evidence.tsx", import.meta.url), "utf8");
  assert.match(ui, /useFocusEffect/); assert.match(ui, /AppState\.addEventListener/); assert.match(ui, /session\.dispose/); assert.match(ui, /key=\{orderId\}/);
});
test("实体手机拒绝回环、模拟器和带凭据的地址，模拟器保留本机访问", () => {
  for (const configuredUrl of ["http://127.0.0.1:3002/api/v1", "http://localhost:3002/api/v1", "http://10.0.2.2:3002/api/v1", "http://u:p@192.168.1.2:3003/api/v1"]) assert.throws(() => resolveApiBaseUrl({ configuredUrl, appEnvironment: "test", platform: "ios", isPhysicalDevice: true }));
  assert.equal(resolveApiBaseUrl({ configuredUrl: "http://192.168.1.2:3003/api/v1", appEnvironment: "test", platform: "ios", isPhysicalDevice: true }), "http://192.168.1.2:3003/api/v1");
});
