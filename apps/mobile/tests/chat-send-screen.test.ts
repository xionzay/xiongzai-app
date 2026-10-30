import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { ApiClientError } from "../src/api/api-error";
import * as domain from "../src/features/chat/chat-domain";
import { ChatSendScope } from "../src/features/chat/chat-send-scope";
import { ChatOutboxStore } from "../src/storage/chat-outbox";
import { MemorySecureStore } from "./test-helpers";

interface NodeView { type: unknown; props: Record<string, unknown> }
function nodes(value: unknown): NodeView[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as NodeView;
  return [node, ...nodes(node.props.children)];
}
function deferred() {
  let resolve = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Execute the actual screen handlers with controlled hook/storage/HTTP boundaries. */
function screen(kind: "chat" | "support", options: { noCase?: boolean; prepareFails?: boolean; failedWriteFails?: boolean; clearFails?: boolean; refreshFails?: boolean; waiting?: ReturnType<typeof deferred> } = {}) {
  const require = createRequire(import.meta.url);
  const scope = new ChatSendScope("test-user:test-conversation");
  const adapter = new MemorySecureStore();
  const outbox = new ChatOutboxStore(adapter, () => "fixed-client-id");
  let sends = 0, creates = 0, failedWrites = 0, cursor = 0, mounted = true, lateUpdates = 0;
  let rejectSend = false;
  const states: unknown[] = [];
  const effects: (() => void | (() => void))[] = [];
  const cleanups: (() => void)[] = [];
  const refresh = async () => { if (options.refreshFails) throw new Error("synthetic refresh error"); };
  const caseItem = { id: "case-1", conversation_id: "conversation-1", status: "WAITING", related_type: null };
  const messages = { data: { pages: [] }, isPending: false, isError: false, refetch: refresh };
  const chatApi = {
    chatOutboxStore: {
      read: (id: string) => outbox.read(id),
      prepare: async (id: string, content: string, stickerId?: string, media?: domain.ChatMedia) => {
        if (options.prepareFails) throw new Error("synthetic secure storage error");
        return outbox.prepare(id, content, stickerId, media);
      },
      failed: async (id: string, item: domain.LocalMessage) => {
        failedWrites++;
        if (options.failedWriteFails) throw new Error("synthetic failed-write error");
        return outbox.failed(id, item);
      },
      clear: async (id: string, clientId: string) => {
        if (options.clearFails) throw new Error("synthetic clear error");
        return outbox.clear(id, clientId);
      }
    },
    chatTransport: {
      sendMessage: async () => {
        sends++;
        if (options.waiting) await options.waiting.promise;
        if (rejectSend) throw new Error("synthetic network error");
      },
      markRead: async () => {}
    },
    useConversation: () => ({ isSuccess: true, data: { can_send: true, counterpart: { kind: "BUYER", nickname: "测试用户" }, conversation_type: "CONSULTATION", product_id: null }, refetch: refresh }),
    useMessages: () => messages,
    useSupportCases: () => ({ data: { pages: [{ items: options.noCase ? [] : [caseItem] }] }, refetch: refresh }),
    createSupportCase: async () => { creates++; if (options.waiting) await options.waiting.promise; return caseItem; }
  };
  const context = {
    exports: {} as Record<string, () => unknown>,
    require(name: string) {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "react") return {
        useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
        useState: (initial: unknown) => {
          const index = cursor++;
          if (index >= states.length) states.push(initial);
          return [states[index], (value: unknown) => { if (!mounted) lateUpdates++; states[index] = value; }];
        },
        useEffect: (fn: () => void | (() => void)) => { if (mounted && effects.length < 2) effects.push(fn); }
      };
      if (name === "react-native") return { ...Object.fromEntries(["ActivityIndicator", "FlatList", "Image", "KeyboardAvoidingView", "Pressable", "RefreshControl", "Text", "TextInput", "View"].map((key) => [key, key])), Platform: { OS: "ios" }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } };
      if (name === "expo-router") return { router: {}, useLocalSearchParams: () => ({ id: "conversation-1" }) };
      if (name === "react-native-safe-area-context") return { SafeAreaView: "SafeAreaView" };
      if (name === "@/auth/auth-provider") return { useAuth: () => ({ user: { id: "test-user", profile: { nickname: "测试买家" } } }) };
      if (name === "@/api/api-error") return { ApiClientError };
      if (name === "@/features/chat/chat-api") return chatApi;
      if (name === "@xiongzai/contracts/bear-stickers") return require(name);
      if (name === "@/features/chat/sticker-panel") return { StickerPanel: "StickerPanel", StickerPicture: "StickerPicture" };
      if (name === "@/features/chat/chat-media-panel") return { ChatMediaPanel: "ChatMediaPanel" };
      if (name === "@/features/chat/chat-media-message") return { ChatMediaMessage: "ChatMediaMessage" };
      if (name === "@/features/chat/chat-domain") return domain;
      if (name === "@/features/chat/use-chat-send-scope") return { useChatSendScope: () => scope };
      if (name === "@/features/chat/support-domain") return { supportStatusCopy: {} };
      if (name === "@/features/discovery/discovery-api") return { useServiceDetail: () => ({ data: null }) };
      if (name === "@/features/checkout/order-api") return { useOrderDetail: () => ({ data: null }) };
      if (name === "@/hooks/use-app-activity") return { useAppActivity: () => "active" };
      if (name === "@/hooks/use-online-status") return { useOnlineStatus: () => true };
      if (name === "@/query/query-client") return { queryClient: { invalidateQueries: refresh } };
      if (name === "@/theme/tokens") return { colors: {} };
      if (name === "@/theme/approved-layout") return { approvedLayout: {} };
      if (name.startsWith("@/components/")) return Object.fromEntries(["BrandBackdrop", "FileImage", "MineTabIcon", "NativeBackdrop", "OrderTabIcon", "ChevronLeftIcon", "ChevronRightIcon"].map((key) => [key, key]));
      if (name.endsWith(".png")) return 1;
      throw new Error(`Unexpected screen dependency: ${name}`);
    }
  };
  const filename = kind === "chat" ? "chat-screen.tsx" : "support-list-screen.tsx";
  const source = readFileSync(new URL(`../src/features/chat/${filename}`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const component = context.exports[kind === "chat" ? "ChatScreen" : "SupportListScreen"]!;
  const render = () => { cursor = 0; return nodes(component()); };
  const find = (label: string) => {
    const found = render().find((node) => node.props.accessibilityLabel === label);
    assert.ok(found, `Missing actual control: ${label}`);
    return found;
  };
  return {
    outbox, scope, render, states,
    media: (media: domain.ChatMedia) => { const panel = render().find(node => node.type === "ChatMediaPanel"); assert.ok(panel); return (panel.props.onSend as (media: domain.ChatMedia) => Promise<boolean>)(media); },
    sticker: (id: string) => { const panel = render().find(node => node.type === "StickerPanel"); assert.ok(panel); return (panel.props.onSend as (id: string) => Promise<void>)(id); },
    mount: () => { render(); for (const effect of effects.splice(0)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } },
    type: () => { const input = find(kind === "chat" ? "消息内容" : "客服问题"); (input.props.onChangeText as (value: string) => void)("本地测试消息"); },
    press: () => { const button = find(kind === "chat" ? "发送消息" : "发送客服消息"); return button.props.onPress as () => void; },
    unmount: () => { mounted = false; scope.dispose(); for (const cleanup of cleanups) cleanup(); },
    rejectSend: () => { rejectSend = true; },
    stats: () => ({ sends, creates, failedWrites, lateUpdates })
  };
}

test("表情发送经过实际页面同一门禁，连点只提交一次且保留文字草稿", async () => {
  const view = screen("chat"); view.type();
  await Promise.all([view.sticker("bear-v3/buyer/001"), view.sticker("bear-v3/buyer/001")]);
  assert.equal(view.stats().sends, 1);
  assert.ok(view.states.includes("本地测试消息"));
});

test("媒体经过实际发送门禁，失败保留 file_id，重试保持消息编号", async () => {
  const view = screen("chat"); view.type(); view.rejectSend();
  const media: domain.ChatMedia = { type: "IMAGE", fileId: "00000000-0000-4000-8000-000000000001" };
  await Promise.all([view.media(media), view.media(media)]);
  assert.equal(view.stats().sends,1);
  const original = await view.outbox.read("conversation-1");
  assert.deepEqual(original?.media,media); assert.equal(original?.state,"FAILED");
  await view.media(media);
  assert.equal((await view.outbox.read("conversation-1"))?.clientMessageId,original?.clientMessageId);
  assert.ok(view.states.includes("本地测试消息"));
});

test("表情失败待发记录包含原表情和编号，非法表情不发送", async () => {
  const view = screen("chat"); view.rejectSend();
  await view.sticker("bear-v3/buyer/001");
  const record = await view.outbox.read("conversation-1");
  assert.equal(record?.stickerId, "bear-v3/buyer/001");
  assert.equal(record?.state, "FAILED");
  await view.sticker("unknown");
  assert.equal(view.stats().sends, 1);
});

for (const kind of ["chat", "support"] as const) {
  test(`${kind}实际发送回调在React重新渲染前阻断重复点击`, async () => {
    const view = screen(kind);
    view.type();
    const press = view.press();
    press(); press();
    await settle();
    assert.equal(view.stats().sends, 1);
    assert.equal(view.stats().failedWrites, 0);
  });

  test(`${kind}安全存储准备失败时不调用发送接口且可结束忙碌状态`, async () => {
    const view = screen(kind, { prepareFails: true });
    view.type(); view.press()(); await settle();
    assert.equal(view.stats().sends, 0);
    assert.ok(view.states.some((value) => typeof value === "string" && /失败|未发送/u.test(value)));
    const operation = view.scope.begin(); assert.ok(operation); operation.finish();
  });

  test(`${kind}服务器已接收后清理失败不得标为发送失败或进入重试`, async () => {
    const view = screen(kind, { clearFails: true });
    view.type(); view.press()(); await settle();
    assert.equal(view.stats().sends, 1);
    assert.equal(view.stats().failedWrites, 0);
    assert.ok(view.states.some((value) => typeof value === "string" && /请勿重复发送/u.test(value)));
  });

  test(`${kind}消息发送后刷新失败不误报发送失败`, async () => {
    const view = screen(kind, { refreshFails: true });
    view.type(); view.press()(); await settle();
    assert.equal(view.stats().sends, 1);
    assert.equal(view.stats().failedWrites, 0);
    assert.equal(await view.outbox.read("conversation-1"), null);
  });

  test(`${kind}网络与失败记录写入均异常仍显示原位重试并保留编号`, async () => {
    const view = screen(kind, { failedWriteFails: true });
    view.rejectSend(); view.type(); view.press()(); await settle();
    const list = view.render().find((node) => node.type === "FlatList");
    const header = list?.props.ListHeaderComponent as NodeView;
    const item = header.props.item as domain.LocalMessage;
    assert.equal(item.state, "FAILED");
    assert.equal(item.clientMessageId, "mobile-fixed-client-id");
    const retry = header.props.onRetry as () => void;
    retry(); retry(); await settle();
    assert.equal(view.stats().sends, 2);
    assert.equal((await view.outbox.read("conversation-1"))?.clientMessageId, item.clientMessageId);
  });

  test(`${kind}卸载后迟到的网络失败不更新State也不复活退出记录`, async () => {
    const waiting = deferred();
    const view = screen(kind, { waiting });
    view.mount(); await settle(); view.type(); view.press()(); await settle();
    view.unmount(); await view.outbox.clearAll(); waiting.reject(new Error("synthetic late network error"));
    await settle();
    assert.equal(view.stats().lateUpdates, 0);
    assert.equal(view.stats().failedWrites, 0);
    assert.equal(await view.outbox.read("conversation-1"), null);
  });

  test(`${kind}重进页面恢复未确认消息提供同编号重试而非永久发送中`, async () => {
    const view = screen(kind);
    const pending = await view.outbox.prepare("conversation-1", "恢复的消息");
    view.mount(); await settle();
    const list = view.render().find((node) => node.type === "FlatList");
    const header = list?.props.ListHeaderComponent as NodeView;
    const item = header.props.item as domain.LocalMessage;
    assert.equal(item.state, "FAILED");
    assert.equal(item.clientMessageId, pending.clientMessageId);
    (header.props.onRetry as () => void)(); await settle();
    assert.equal(view.stats().sends, 1);
    assert.equal(await view.outbox.read("conversation-1"), null);
  });
}

test("客服实际创建工单回调也同步阻断连点，不重复创建工单", async () => {
  const waiting = deferred();
  const view = screen("support", { noCase: true, waiting });
  view.type(); const press = view.press(); press(); press();
  assert.equal(view.stats().creates, 1);
  waiting.resolve(); await settle();
  assert.equal(view.stats().sends, 0);
});
