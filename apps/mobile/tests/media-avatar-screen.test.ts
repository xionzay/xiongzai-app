import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const screenSource = readFileSync(fileURLToPath(new URL("../src/features/account/media-avatar-screen.tsx", import.meta.url).href), "utf8");
const uploadSource = readFileSync(fileURLToPath(new URL("../src/features/files/file-upload-domain.ts", import.meta.url).href), "utf8");
const presignedSource = readFileSync(fileURLToPath(new URL("../src/features/files/presigned-upload.ts", import.meta.url).href), "utf8");

test("头像页同时展示服务端正式头像和本地裁剪预览", () => {
  assert.match(screenSource, /<FileImage[^>]+当前正式头像/u);
  assert.match(screenSource, /<Image[^>]+待上传头像本地预览/u);
  assert.match(screenSource, /新头像本地预览/u);
  assert.match(screenSource, /审核期间仍保持这里不变/u);
});

test("头像页覆盖待审、拒绝、刷新、删除、取消和只重试确认动作", () => {
  for (const copy of ["等待管理员审核", "未通过审核", "刷新审核状态", "删除待审头像并重选", "取消上传", "只重试服务端确认"]) {
    assert.match(screenSource, new RegExp(copy, "u"));
  }
  assert.match(screenSource, /confirmationPending/u);
  assert.match(uploadSource, /putCompleted/u);
  assert.match(uploadSource, /error instanceof AvatarConfirmationError/u);
});

test("页面卸载会取消进行中的请求并阻止页面状态更新", () => {
  assert.match(screenSource, /return \(\) => \{[\s\S]*mounted\.current = false;[\s\S]*uploadAbort\.current\?\.abort\(\)/u);
  assert.match(screenSource, /if \(!mounted\.current\) return;/u);
  assert.match(screenSource, /if \(!asset \|\| uploadAbort\.current\) return;/u);
});

test("审核通过绑定使用最新版本，并在并发冲突后刷新服务端用户事实", () => {
  assert.match(screenSource, /const latest = await refreshUser\(\);[\s\S]*approvedAvatarProfileInput\(approvedFile, latest\)/u);
  assert.match(screenSource, /error instanceof ApiClientError && error\.code === "RESOURCE_VERSION_CONFLICT"[\s\S]*await refreshUser\(\)\.catch/u);
  assert.match(screenSource, /invalidateQueries\(\{ queryKey: \["public-file", approvedFile\.id\] \}\)/u);
});

test("直传边界不携带登录 Authorization，也不在页面展示短时 URL 或真实进度百分比", () => {
  assert.match(presignedSource, /fetchImpl\(upload\.url, \{ method: "PUT", headers: upload\.headers/u);
  assert.doesNotMatch(presignedSource, /Authorization|Bearer/u);
  assert.doesNotMatch(screenSource, /upload\.url|content_url|console\.|百分比|%/u);
  assert.match(screenSource, /本页面不显示或记录预签名 URL/u);
});
