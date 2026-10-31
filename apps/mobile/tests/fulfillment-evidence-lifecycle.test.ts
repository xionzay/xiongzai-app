import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { EvidencePreviewSession, type EvidenceAccess } from "../src/features/checkout/evidence-preview-session";

type Element = { type: string | ((props: unknown) => Element); props: Record<string, unknown> };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
const files = [{ file_id: "synthetic-video", kind: "VIDEO" }];
const grant = (): EvidenceAccess => ({
  id: files[0]!.file_id, file_type: "ORDER_FULFILLMENT_VIDEO", mime_type: "video/mp4",
  visibility: "PRIVATE", upload_status: "VERIFIED", moderation_status: "APPROVED",
  access: { url: "http://127.0.0.1:9000/private/synthetic?signature=memory-only", expires_at: new Date(Date.now() + 60_000).toISOString() },
});

// Execute the actual TSX component and its real access session. Native primitives
// and hook scheduling are controlled here; this is not a device/player test.
function harness(request: (path: string, signal: AbortSignal) => Promise<EvidenceAccess>) {
  const require = createRequire(import.meta.url);
  let cursor = 0, slots: Slot[] = [], effects: (() => void)[] = [];
  let status = "authenticated", online = true;
  let foreground: ((state: string) => void) | undefined, blurred: (() => void) | undefined;
  const same = (a: unknown[] | undefined, b: unknown[]) => !!a && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index]!.value, (value: unknown) => { const slot = slots[index]!; slot.value = typeof value === "function" ? value(slot.value) : value; }];
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = cursor++, slot = slots[index];
      if (same(slot?.deps, deps)) return;
      effects.push(() => { slot?.cleanup?.(); slots[index] = { deps, cleanup: effect() || undefined }; });
    },
    useCallback(callback: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: callback };
      return slots[index]!.value;
    },
  };
  const context = {
    exports: {} as { FulfillmentEvidence: (props: object) => Element },
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react-native") return {
        ActivityIndicator: "ActivityIndicator", Image: "Image", Text: "Text", View: "View",
        AppState: { currentState: "active", addEventListener(_event: string, callback: typeof foreground) { foreground = callback; return { remove() { foreground = undefined; } }; } },
      };
      if (name === "expo-router") return { useFocusEffect(callback: () => () => void) { blurred = callback(); } };
      if (name === "@/auth/auth-provider") return { useAuth: () => ({ status }) };
      if (name === "@/hooks/use-online-status") return { useOnlineStatus: () => online };
      if (name === "./evidence-preview-session") return { EvidencePreviewSession };
      if (name === "./evidence-video") return { EvidenceVideo: "EvidenceVideo" };
      if (name === "@/auth/runtime") return { apiClient: { request: (path: string, options: { signal: AbortSignal }) => request(path, options.signal) } };
      if (name === "@/components/primary-button") return { PrimaryButton: "PrimaryButton" };
      if (name === "@/components/notice-banner") return { NoticeBanner: "NoticeBanner" };
      if (name === "@/features/files/image-upload-slot") return { ImageUploadSlot: "ImageUploadSlot" };
      if (name === "@/features/files/file-upload-api" || name === "expo-document-picker") return {};
      return require(name);
    },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/features/checkout/fulfillment-evidence.tsx", import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  let orderId = "synthetic-order-one";
  const render = (): Element => {
    cursor = 0; effects = [];
    const wrapper = context.exports.FulfillmentEvidence({ orderId, files });
    assert.equal(typeof wrapper.type, "function");
    const tree = (wrapper.type as (props: unknown) => Element)(wrapper.props);
    for (const effect of effects) effect();
    return tree;
  };
  const dispose = () => { blurred?.(); for (const slot of slots) slot?.cleanup?.(); };
  const nodes = (value: unknown): Element[] => {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(nodes);
    const element = value as Element;
    return element.props ? [element, ...nodes(element.props.children)] : [];
  };
  const press = (label: string) => {
    const node = nodes(render()).find(x => x.type === "PrimaryButton" && x.props.label === label);
    assert.ok(node, `Missing control: ${label}`); assert.notEqual(node.props.disabled, true);
    (node.props.onPress as () => void)();
  };
  return {
    render, nodes, press, dispose, blur: () => blurred?.(),
    background: (next: string) => foreground?.(next),
    auth: (next: string) => { status = next; render(); },
    network: (next: boolean) => { online = next; render(); },
    order: (next: string) => { dispose(); slots = []; orderId = next; render(); },
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const hasVideo = (h: ReturnType<typeof harness>) => h.nodes(h.render()).some(x => x.type === "EvidenceVideo");

test("真实凭证组件在返回、后台和退出登录后移除播放器，恢复前台不会自动重取", async () => {
  let requests = 0;
  const h = harness(async () => { requests++; return grant(); });
  try {
    h.press("查看连续录屏"); await flush(); assert.equal(hasVideo(h), true);
    h.blur(); assert.equal(hasVideo(h), false);
    h.press("查看连续录屏"); await flush(); assert.equal(hasVideo(h), true);
    h.background("background"); assert.equal(hasVideo(h), false);
    const retry = h.nodes(h.render()).find(x => x.props.label === "重新获取访问权限");
    assert.equal(retry?.props.disabled, true);
    h.background("active"); assert.equal(hasVideo(h), false); assert.equal(requests, 2);
    h.press("重新获取访问权限"); await flush(); assert.equal(hasVideo(h), true);
    h.auth("anonymous"); assert.equal(hasVideo(h), false);
    assert.ok(h.nodes(h.render()).filter(x => x.type === "PrimaryButton").every(x => x.props.disabled === true));
  } finally { h.dispose(); }
});

test("真实凭证组件断网取消请求、忽略迟到响应，仅显式重试才取得新权限", async () => {
  let resolve!: (value: EvidenceAccess) => void, signal!: AbortSignal, requests = 0;
  const h = harness(async (_path, current) => {
    requests++; signal = current;
    return requests === 1 ? new Promise(done => { resolve = done; }) : grant();
  });
  try {
    h.press("查看连续录屏"); h.network(false); assert.equal(signal.aborted, true);
    resolve(grant()); await flush(); assert.equal(hasVideo(h), false);
    assert.ok(h.nodes(h.render()).some(x => String(x.props.message).includes("网络已断开")));
    h.network(true); assert.equal(requests, 1); assert.equal(hasVideo(h), false);
    h.press("重新获取访问权限"); await flush(); assert.equal(requests, 2); assert.equal(hasVideo(h), true);
  } finally { h.dispose(); }
});

test("订单组件按订单重建并取消旧访问；无权限异常不包含私有访问地址", async () => {
  let resolve!: (value: EvidenceAccess) => void, signal!: AbortSignal, requests = 0;
  const h = harness(async (_path, current) => {
    requests++; signal = current;
    if (requests === 1) return new Promise(done => { resolve = done; });
    throw Object.assign(new Error(grant().access.url), { status: 403 });
  });
  try {
    h.press("查看连续录屏"); h.order("synthetic-order-two"); assert.equal(signal.aborted, true);
    resolve(grant()); await flush(); assert.equal(hasVideo(h), false);
    h.press("查看连续录屏"); await flush(); assert.equal(hasVideo(h), false);
    const messages = h.nodes(h.render()).filter(x => x.type === "NoticeBanner").map(x => String(x.props.message));
    assert.deepEqual(messages, ["没有查看此订单凭证的权限。"]);
    assert.doesNotMatch(messages.join(""), /signature|https?:|memory-only/);
  } finally { h.dispose(); }
});
