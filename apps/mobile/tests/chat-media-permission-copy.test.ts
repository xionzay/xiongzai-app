import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("聊天图片和语音用途同时写入 Expo、iOS 权限说明与 App 权限页", () => {
  for (const path of ["app.config.ts", "ios/app/Info.plist", "src/features/account/permissions-screen.tsx"]) {
    const text = source(path);
    assert.match(text, /聊天图片/u, path);
    assert.match(text, /10–30 秒声音名片/u, path);
    assert.match(text, /1–60 秒聊天语音/u, path);
    assert.match(text, /不用于实时通话/u, path);
  }
});

test("消息入口正确说明媒体审核边界，不再声称仅支持文字", () => {
  const text = source("src/features/chat/messages-screen.tsx");
  assert.match(text, /文字、平台表情及审核通过的图片和语音/u);
  assert.match(text, /不支持实时通话/u);
  assert.doesNotMatch(text, /仅支持文字/u);
});

test("语音气泡保留可操作宽度且不超过父容器，发送成功刷新上传恢复列表", () => {
  assert.match(source("src/features/chat/chat-media-message.tsx"), /width: 220, maxWidth: "100%"/u);
  assert.match(source("src/features/chat/chat-media-panel.tsx"), /if \(acknowledged\) void recovery\.refetch\(\)/u);
});
