import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const cases = [["phone-change", "手机号换绑"], ["data-export", "个人数据下载"], ["account-cancellation", "注销账号"]] as const;
for (const [route, title] of cases) {
  test(`${title}的实际路由只展示暂未开放，深链也不加载账号变更接口`, () => {
    const require = createRequire(import.meta.url);
    const context = {
      exports: {} as { default: () => { type: string; props: { title: string; description: string; nextStep: string } } },
      require: (name: string) => {
        if (name === "react/jsx-runtime") return require(name);
        if (name === "@/features/account/unavailable-screen") return { UnavailableScreen: "UnavailableScreen" };
        throw new Error(`Closed account route must not load a workflow or API: ${name}`);
      }
    };
    const source = readFileSync(new URL(`../app/settings/${route}.tsx`, import.meta.url), "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
    const rendered = context.exports.default();
    assert.equal(rendered.type, "UnavailableScreen");
    assert.equal(rendered.props.title, title);
    assert.match(rendered.props.description, /暂未开放/);
    assert.match(rendered.props.nextStep, /平台客服/);
  });
}
