import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { verificationRequestMessage } from "../src/auth/auth-copy";

test("开发和测试验证码反馈不假称真实短信送达、不展示固定验证码", () => {
  for (const environment of ["development", "test"] as const) {
    const message = verificationRequestMessage(environment);
    assert.match(message, /本地配置的开发验证码/u);
    assert.match(message, /不代表真实短信已送达/u);
    assert.doesNotMatch(message, /请查看短信|\d{6}/u);
  }
});

test("正式环境验证码反馈不展示开发引导", () => {
  assert.equal(verificationRequestMessage("production"), "验证码已发送，请查看短信");
  assert.doesNotMatch(verificationRequestMessage("production"), /本地|开发|测试/u);
});

interface CheckboxView {
  type: string;
  props: {
    accessibilityRole: string;
    accessibilityLabel: string;
    accessibilityState: { checked: boolean; disabled: boolean };
    disabled: boolean;
    onPress(): void;
    style(input: { pressed: boolean }): (Record<string, unknown> | false)[];
    children: { props: { accessibilityElementsHidden: boolean; importantForAccessibility: string; style: (Record<string, unknown> | false)[] } };
  };
}

function checkbox(checked: boolean, disabled: boolean, onPress: () => void): CheckboxView {
  const require = createRequire(import.meta.url);
  const context = {
    exports: {} as { PolicyConsentCheckbox(props: { label: string; checked: boolean; disabled: boolean; onPress(): void }): CheckboxView },
    require(name: string) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "react-native") return { Pressable: "Pressable", Text: "Text", View: "View", StyleSheet: { create: (styles: unknown) => styles } };
      if (name === "@/components/jelly-icon") return { JellyIcon: "JellyIcon" };
      if (name === "@/theme/tokens") return { colors: { border: "border", surfaceCard: "surface", brand: "brand", white: "white" } };
      throw new Error(`Unexpected checkbox import: ${name}`);
    }
  };
  const source = readFileSync(new URL("../src/components/policy-consent-checkbox.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports.PolicyConsentCheckbox({ label: "在线确认测试草案", checked, disabled, onPress });
}

test("实际协议勾选组件不会默认同意，勾选值与操作由父级控制", () => {
  let calls = 0;
  const view = checkbox(false, false, () => { calls++; });
  assert.equal(view.type, "Pressable");
  assert.equal(view.props.accessibilityRole, "checkbox");
  assert.equal(view.props.accessibilityLabel, "在线确认测试草案");
  assert.equal(view.props.accessibilityState.checked, false);
  assert.equal(calls, 0);
  view.props.onPress();
  assert.equal(calls, 1);
  assert.equal(view.props.accessibilityState.checked, false);
  assert.equal(checkbox(true, false, () => {}).props.accessibilityState.checked, true);
});

test("协议实际触控达到48，保留21视觉图形、禁用语义且不重复播报装饰图标", () => {
  const view = checkbox(true, true, () => {});
  const target = view.props.style({ pressed: false })[0];
  assert.ok(target);
  assert.ok(Number(target.minWidth) >= 48);
  assert.ok(Number(target.minHeight) >= 48);
  const box = view.props.children.props.style[0];
  assert.ok(box);
  assert.equal(box.width, 21);
  assert.equal(box.height, 21);
  assert.equal(view.props.disabled, true);
  assert.equal(view.props.accessibilityState.disabled, true);
  assert.equal(view.props.children.props.accessibilityElementsHidden, true);
  assert.equal(view.props.children.props.importantForAccessibility, "no-hide-descendants");
  assert.equal(view.props.style({ pressed: true })[1], false);
});
