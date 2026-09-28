import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = await readFile(new URL("../app/SupportInboxEntry.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const scope = { exports: {}, React };
vm.runInNewContext(compiled, scope);
const { summarizeSupportInbox, SupportInboxEntry } = scope.exports;
const item = (id, overrides = {}) => ({ id, conversation_type: "SUPPORT", last_message_preview: `消息 ${id}`, last_message_at: "2026-09-22T08:00:00Z", created_at: "2026-09-21T08:00:00Z", unread_count: 0, ...overrides });

test("support inbox selects the latest message, aggregates unread, and preserves other conversations", () => {
  const older = item("older", { unread_count: 2 });
  const latest = item("latest", { last_message_at: "2026-09-22T09:00:00Z", unread_count: 3 });
  const order = item("order", { conversation_type: "ORDER", unread_count: 7 });
  const input = [older, order, latest];
  const result = summarizeSupportInbox(input);
  assert.equal(result.latest, latest);
  assert.equal(result.unread, 5);
  assert.equal(result.others.length, 1);
  assert.equal(result.others[0], order);
  assert.deepEqual(input, [older, order, latest]);
  assert.equal(older.unread_count, 2);
});

test("no history shows the requested fallback without fabricated time or badge", () => {
  const empty = summarizeSupportInbox([]);
  const markup = renderToStaticMarkup(SupportInboxEntry({ ...empty, onOpen() {} }));
  assert.match(markup, /订单、退款、投诉与账号问题/);
  assert.doesNotMatch(markup, /<time|support-unread/);
  assert.equal((markup.match(/平台客服/g) || []).length, 1);
});

test("pinned entry displays latest content and real unread count and opens once", () => {
  let opened = 0;
  const entry = SupportInboxEntry({ latest: item("latest"), unread: 120, onOpen() { opened++; } });
  const markup = renderToStaticMarkup(entry);
  assert.match(markup, /消息 latest/);
  assert.match(markup, /dateTime="2026-09-22T08:00:00Z"/);
  assert.match(markup, /120 条客服未读消息/);
  assert.match(markup, /99\+/);
  entry.props.onClick();
  assert.equal(opened, 1);
});

test("zero unread hides badge and message text is safely escaped", () => {
  const markup = renderToStaticMarkup(SupportInboxEntry({ latest: item("safe", { last_message_preview: "<script>test</script>" }), unread: 0, onOpen() {} }));
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /support-unread|<script>/);
});
