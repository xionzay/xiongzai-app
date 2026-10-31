import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { ExpoConfig } from "expo/config";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("聊天图片和语音用途同时写入 Expo、实际 iOS 插件输出与 App 权限页", async () => {
  // Native build folders are generated/ignored. Execute the installed production
  // plugins in memory instead of requiring one developer's untracked build output.
  const context={exports:{} as {default:(input:{config:ExpoConfig})=>ExpoConfig},process:{env:{EXPO_PUBLIC_APP_ENV:"test"}}};
  vm.runInNewContext(ts.transpileModule(source("app.config.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  let config=context.exports.default({config:{name:"local-permission-test",slug:"local-permission-test"}});
  const require=createRequire(import.meta.url);
  for(const name of ["expo-image-picker","expo-audio"]){
    const setting=config.plugins?.find(entry=>Array.isArray(entry)&&entry[0]===name);
    assert.ok(Array.isArray(setting),`${name} is configured`);
    const plugin=require(`${name}/app.plugin.js`);
    config=(plugin.default??plugin)(config,setting[1]);
  }
  const mod=(config as ExpoConfig&{mods:{ios:{infoPlist:(input:unknown)=>Promise<{modResults:Record<string,unknown>}>}}}).mods.ios.infoPlist;
  const result=await mod({...config,modResults:{},modRequest:{projectRoot:new URL('../',import.meta.url).pathname,platform:'ios',modName:'infoPlist',introspect:true,ignoreExistingNativeFiles:true}});
  assert.match(String(result.modResults.NSPhotoLibraryUsageDescription),/聊天图片/u);
  assert.match(String(result.modResults.NSMicrophoneUsageDescription),/10–30 秒声音名片.*1–60 秒聊天语音.*不用于实时通话/u);
  for (const [path,text] of [["app.config.ts",source("app.config.ts")],["iOS plugin Info.plist",JSON.stringify(result.modResults)],["src/features/account/permissions-screen.tsx",source("src/features/account/permissions-screen.tsx")]] as const) {
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
