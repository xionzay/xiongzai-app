import assert from "node:assert/strict";
import test from "node:test";
import { buildMobileLoginRequest } from "../src/auth/mobile-login-request";

test("移动端登录在获取令牌前提交当前协议版本", () => {
  const request = buildMobileLoginRequest({
    phone: "13900002002",
    code: "246810",
    policyVersionIds: ["019b0000-0000-7000-8000-000000000001", "019b0000-0000-7000-8000-000000000001"],
    device: {
      deviceId: "device-android-test",
      deviceName: "Android test device",
      platform: "ANDROID",
      appVersion: "0.1.0"
    }
  });

  assert.deepEqual(request, {
    phone: "13900002002",
    code: "246810",
    device_id: "device-android-test",
    device_name: "Android test device",
    platform: "ANDROID",
    app_version: "0.1.0",
    policy_version_ids: ["019b0000-0000-7000-8000-000000000001"]
  });
});

test("移动端登录没有原生版本号时不发送空 app_version", () => {
  const request = buildMobileLoginRequest({
    phone: "13900002001",
    code: "246810",
    policyVersionIds: ["019b0000-0000-7000-8000-000000000001"],
    device: {
      deviceId: "device-ios-test",
      deviceName: "iPhone test device",
      platform: "IOS"
    }
  });

  assert.equal("app_version" in request, false);
  assert.deepEqual(request.policy_version_ids, ["019b0000-0000-7000-8000-000000000001"]);
});
