import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["ClosedAccountFeature", "DataExportScreen", "AccountCancellationScreen"]);
const functions = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(parsed)).join("\n");
for (const [name, title] of [["DataExportScreen", "个人数据下载"], ["AccountCancellationScreen", "注销账号"]]) {
  test(`Web ${title}仅呈现关闭说明，挂载与点击客服均不提交账户任务`, () => {
    const navigation = [];
    const context = {
      exports: {}, localAccountLifecycleEnabled: false, Header: "Header",
      DataExportWorkflowScreen() { throw new Error("Closed feature mounted its API workflow"); },
      AccountCancellationWorkflowScreen() { throw new Error("Closed feature mounted its API workflow"); },
      require: name => { assert.equal(name, "react/jsx-runtime"); return require(name); }
    };
    vm.runInNewContext(ts.transpileModule(functions + `\nexport { ${name} };`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
    const nodes = [];
    const visit = value => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object" || !value.props) return;
      if (typeof value.type === "function") return visit(value.type(value.props));
      nodes.push(value); visit(value.props.children);
    };
    visit(context.exports[name]({ go: target => navigation.push(target), notify: () => { throw new Error("Closed feature claimed a result"); } }));
    assert.ok(nodes.some(n => n.type === "h2" && n.props.children === "功能暂未开放"));
    assert.ok(nodes.some(n => n.type === "Header" && n.props.title === title));
    const button = nodes.find(n => n.type === "button");
    assert.equal(button.props.children, "联系平台客服");
    button.props.onClick();
    assert.deepEqual(navigation, ["customerService"]);
  });
}
