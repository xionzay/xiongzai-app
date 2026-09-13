import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiBaseUrl } from "../src/api/config";
import { resolveInitialRoute } from "../src/auth/route-guard";
import { loginFormSchema, profileFormSchema } from "../src/auth/validation";
import { resolveRemoteState } from "../src/query/remote-state";
import type { Viewer } from "../src/types/api";
import { formatCent } from "../src/utils/money";

const user = (initialized: boolean): Viewer => ({
  id: "user-1", phone_mask: "138****8000", status: "NORMAL", profile_initialized: initialized, version: 1,
  profile: initialized ? { nickname: "熊崽", avatar_file_id: null, bio: null, public_user_no: "XZ1", version: 1 } : null,
  identity_verification: null
});

test("路由守卫覆盖启动、匿名、待初始化和已完成资料", () => {
  assert.equal(resolveInitialRoute("booting", null), "/");
  assert.equal(resolveInitialRoute("anonymous", null), "/(buyer-tabs)");
  assert.equal(resolveInitialRoute("authenticated", user(false)), "/(auth)/profile-setup");
  assert.equal(resolveInitialRoute("authenticated", user(true)), "/(buyer-tabs)");
});

test("登录和资料表单执行严格校验", () => {
  assert.equal(loginFormSchema.safeParse({ phone: "13800138000", code: "123456" }).success, true);
  assert.equal(loginFormSchema.safeParse({ phone: "138", code: "12" }).success, false);
  assert.equal(profileFormSchema.safeParse({ nickname: "熊崽" }).success, true);
  assert.equal(profileFormSchema.safeParse({ nickname: "联系我13800138000" }).success, false);
});

test("首页远程状态覆盖加载、失败、空数据与成功", () => {
  assert.equal(resolveRemoteState({ loading: true, error: false, itemCount: 0 }), "loading");
  assert.equal(resolveRemoteState({ loading: false, error: true, itemCount: 0 }), "error");
  assert.equal(resolveRemoteState({ loading: false, error: false, itemCount: 0 }), "empty");
  assert.equal(resolveRemoteState({ loading: false, error: false, itemCount: 1 }), "success");
});

test("金额只使用十进制分字符串格式化", () => {
  assert.equal(formatCent("0"), "¥0.00");
  assert.equal(formatCent("105"), "¥1.05");
  assert.equal(formatCent("123456789"), "¥1,234,567.89");
  assert.throws(() => formatCent("10.5"));
});

test("生产环境拒绝非 HTTPS API", () => {
  assert.equal(resolveApiBaseUrl({ configuredUrl: "https://api.example.com/api/v1/", appEnvironment: "production", platform: "ios" }), "https://api.example.com/api/v1");
  assert.throws(() => resolveApiBaseUrl({ configuredUrl: "http://api.example.com/api/v1", appEnvironment: "production", platform: "android" }));
});

test("模拟器忽略易过期的真机局域网地址并使用各平台本机桥接", () => {
  assert.equal(resolveApiBaseUrl({
    configuredUrl: "http://192.168.2.218:3002/api/v1",
    appEnvironment: "development",
    platform: "ios",
    isPhysicalDevice: false
  }), "http://127.0.0.1:3002/api/v1");
  assert.equal(resolveApiBaseUrl({
    configuredUrl: "http://192.168.2.218:3002/api/v1",
    appEnvironment: "development",
    platform: "android",
    isPhysicalDevice: false
  }), "http://10.0.2.2:3002/api/v1");
  assert.equal(resolveApiBaseUrl({
    configuredUrl: "http://192.168.2.218:3002/api/v1",
    appEnvironment: "development",
    platform: "ios",
    isPhysicalDevice: true
  }), "http://192.168.2.218:3002/api/v1");
  assert.throws(() => resolveApiBaseUrl({
    appEnvironment: "development",
    platform: "android",
    isPhysicalDevice: true
  }), /EXPO_PUBLIC_API_BASE_URL/u);
});
