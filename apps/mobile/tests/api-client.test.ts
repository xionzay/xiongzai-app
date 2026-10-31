import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "../src/api/api-error";
import { ApiClient } from "../src/api/client";
import { TokenVault } from "../src/auth/token-vault";
import { SecureCredentialsStore } from "../src/storage/secure-credentials";
import { jsonResponse, MemorySecureStore, tokenResponse } from "./test-helpers";

function setup(fetchImpl: typeof fetch) {
  const vault = new TokenVault();
  const secure = new SecureCredentialsStore(new MemorySecureStore());
  const client = new ApiClient("https://api.example.test/api/v1", vault, secure, fetchImpl);
  return { client, vault, secure };
}

test('评价图片使用已配置 API 来源且不拼接凭据，拒绝任意路径',()=>{
  const {client}=setup(async()=>{throw Error('must not fetch');});
  const path='/api/v1/files/review-images/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/content';
  assert.equal(client.reviewContentUrl(path),'https://api.example.test'+path);
  for(const invalid of ['https://untrusted.invalid/'+path,path+'?token=secret','/api/v1/me'])assert.throws(()=>client.reviewContentUrl(invalid));
});

test("短信登录成功后 Token 按安全边界分别保存", async () => {
  const responseBody = tokenResponse();
  const { client, vault, secure } = setup(async () => jsonResponse(responseBody));
  const response = await client.publicRequest<typeof responseBody>("/auth/mobile/sms/login", { method: "POST" });
  await client.acceptTokens(response);
  assert.equal(vault.getAccessToken(), "access-1");
  assert.equal(await secure.getRefreshToken(), "refresh-1");
});

test("短信登录失败返回可识别 API 错误且不保存 Token", async () => {
  const { client, vault, secure } = setup(async () => jsonResponse({ code: "AUTH_SMS_INVALID", message: "验证码错误" }, 401));
  await assert.rejects(client.publicRequest("/auth/mobile/sms/login", { method: "POST" }), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "AUTH_SMS_INVALID");
    return true;
  });
  assert.equal(vault.getAccessToken(), null);
  assert.equal(await secure.getRefreshToken(), null);
});

test("没有 Access Token 时私有请求立即进入登录拦截且不访问网络", async () => {
  let fetchCount = 0;
  const { client } = setup(async () => {
    fetchCount += 1;
    return jsonResponse({ ok: true });
  });
  await assert.rejects(client.request("/me"), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "AUTH_REQUIRED");
    assert.equal(error.status, 401);
    return true;
  });
  assert.equal(fetchCount, 0);
});

test("冷启动使用 Refresh Token 恢复 Session", async () => {
  let body = "";
  const { client, vault, secure } = setup(async (_url, init) => {
    body = String(init?.body);
    return jsonResponse(tokenResponse("restored"));
  });
  await secure.setRefreshToken("stored-refresh");
  await secure.getOrCreateDeviceId(() => "device-1");
  const restored = await client.refresh();
  assert.match(body, /stored-refresh/u);
  assert.match(body, /device-1/u);
  assert.equal(restored.user.id, "user-1");
  assert.equal(vault.getAccessToken(), "access-restored");
});

test("并发 401 只触发一个 Refresh，随后各自最多重试一次", async () => {
  let refreshCount = 0;
  let businessCount = 0;
  const { client, vault, secure } = setup(async (url, init) => {
    if (String(url).endsWith("/token/refresh")) {
      refreshCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse(tokenResponse("new"));
    }
    businessCount += 1;
    const authorization = new Headers(init?.headers).get("authorization");
    return authorization === "Bearer access-new" ? jsonResponse({ ok: true }) : jsonResponse({ code: "AUTH_REQUIRED" }, 401);
  });
  vault.setAccessToken("access-old");
  await secure.setRefreshToken("refresh-old");
  await secure.getOrCreateDeviceId(() => "device-1");
  const results = await Promise.all([client.request<{ ok: boolean }>("/me"), client.request<{ ok: boolean }>("/me")]);
  assert.equal(results.every((item) => item.ok), true);
  assert.equal(refreshCount, 1);
  assert.equal(businessCount, 4);
});

test("刷新后仍为 401 时不会无限刷新", async () => {
  let refreshCount = 0;
  let businessCount = 0;
  const { client, vault, secure } = setup(async (url) => {
    if (String(url).endsWith("/token/refresh")) {
      refreshCount += 1;
      return jsonResponse(tokenResponse("new"));
    }
    businessCount += 1;
    return jsonResponse({ code: "AUTH_REQUIRED", message: "未授权" }, 401);
  });
  vault.setAccessToken("access-old");
  await secure.setRefreshToken("refresh-old");
  await secure.getOrCreateDeviceId(() => "device-1");
  await assert.rejects(client.request("/me"), ApiClientError);
  assert.equal(refreshCount, 1);
  assert.equal(businessCount, 2);
});

test("退出后的本地清理同时移除内存 Access Token 和 Refresh Token", async () => {
  const { client, vault, secure } = setup(async () => new Response(null, { status: 204 }));
  vault.setAccessToken("access-secret");
  await secure.setRefreshToken("refresh-secret");
  await client.request<void>("/auth/mobile/logout", { method: "POST", retryAfterRefresh: false });
  await client.clearAuthentication();
  assert.equal(vault.getAccessToken(), null);
  assert.equal(await secure.getRefreshToken(), null);
});

test("网络超时返回可安全识别错误，调用方可复用幂等键重试", async () => {
  const { client } = setup(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  await assert.rejects(client.publicRequest("/slow", { timeoutMs: 5 }), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "NETWORK_TIMEOUT");
    return true;
  });
});

test("服务端返回用户禁用时不尝试刷新并原子清理 Session", async () => {
  let refreshCount = 0;
  let failureCode = "";
  const { client, vault, secure } = setup(async (url) => {
    if (String(url).endsWith("/token/refresh")) refreshCount += 1;
    return jsonResponse({ code: "USER_DISABLED", message: "账号已停用" }, 403);
  });
  vault.setAccessToken("access-secret");
  await secure.setRefreshToken("refresh-secret");
  client.setAuthFailureHandler((error) => { failureCode = error.code; });

  await assert.rejects(client.request("/me"), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "USER_DISABLED");
    return true;
  });

  assert.equal(refreshCount, 0);
  assert.equal(failureCode, "USER_DISABLED");
  assert.equal(vault.getAccessToken(), null);
  assert.equal(await secure.getRefreshToken(), null);
});
