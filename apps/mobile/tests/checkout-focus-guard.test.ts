import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

type Destination = { pathname: string; params: { action: string; returnTo: string } };

/** Run real screen hooks with a controlled navigation focus boundary, not a device E2E. */
function redirectFromScreen(kind: "schedule" | "confirm", focused: boolean, status: string) {
  const require = createRequire(import.meta.url);
  const redirects: Destination[] = [];
  const effects: (() => void)[] = [];
  const params = { productId: "product-1", skuId: "sku-1", slotId: "slot-1", startsAt: "2030-01-02T10:00:00.000Z" };
  const pending = () => ({ isPending: true });
  const context = {
    exports: {} as Record<string, () => unknown>, URLSearchParams,
    require(name: string) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "react") return {
        useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
        useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value }),
        useEffect: (fn: () => void) => effects.push(fn)
      };
      if (name === "expo-router") return {
        router: { replace: (destination: Destination) => redirects.push(destination) },
        useLocalSearchParams: () => params,
        useFocusEffect: (fn: () => void) => { if (focused) effects.push(fn); }
      };
      if (name === "react-native") return { StyleSheet: { create: (value: unknown) => value }, Platform: { OS: "android" } };
      if (name === "@/auth/auth-provider") return { useAuth: () => ({ status }) };
      if (name === "@/features/discovery/discovery-api") return { useServiceDetail: pending, useAvailability: pending };
      if (name === "@/features/checkout/order-api") return { useOrderPreview: pending };
      if (name === "@/features/account/account-api") return { usePolicies: pending };
      if (name === "@/hooks/use-online-status") return { useOnlineStatus: () => true };
      if (name === "@/features/checkout/checkout-domain") return { SingleFlight: class {} };
      if (name === "@/theme/tokens") return { colors: {} };
      if (name === "@/utils/money" || name === "@/api/api-error" || name === "@/auth/runtime" || name === "@/query/query-client" || name === "expo-crypto" || name === "react-native-safe-area-context") return {};
      if (name.startsWith("@/components/") || name === "../../components/jelly-icon") return new Proxy({}, { get: (_target, key) => String(key) });
      throw new Error(`Unexpected screen dependency: ${name}`);
    }
  };
  const source = readFileSync(new URL(`../src/features/checkout/${kind === "schedule" ? "schedule" : "confirm-order"}-screen.tsx`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  context.exports[kind === "schedule" ? "ScheduleScreen" : "ConfirmOrderScreen"]!();
  for (const effect of effects) effect();
  return redirects;
}

for (const kind of ["schedule", "confirm"] as const) {
  test(`${kind}：后台堆栈页不能在退出时抢走当前页面的登录返回目标`, () => {
    assert.equal(redirectFromScreen(kind, false, "anonymous").length, 0);
  });
  test(`${kind}：当前游客页仍拦截，并保留原服务/规格及预约来源`, () => {
    const [destination] = redirectFromScreen(kind, true, "anonymous");
    assert.equal(destination?.pathname, "/(auth)/required");
    const target = new URL(destination!.params.returnTo, "https://internal.invalid");
    assert.equal(target.pathname, `/checkout/${kind}`);
    assert.equal(target.searchParams.get("productId"), "product-1");
    assert.equal(target.searchParams.get("skuId"), "sku-1");
    if (kind === "confirm") {
      assert.equal(target.searchParams.get("slotId"), "slot-1");
      assert.equal(target.searchParams.get("startsAt"), "2030-01-02T10:00:00.000Z");
    }
  });
  test(`${kind}：认证恢复期间和已登录状态不触发游客重定向`, () => {
    for (const status of ["booting", "authenticated"]) assert.equal(redirectFromScreen(kind, true, status).length, 0);
  });
}
