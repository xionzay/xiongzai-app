import assert from "node:assert/strict";
import test from "node:test";
import { canonicalRequestHash } from "../dist/index.js";

test("canonical request hash is independent of object key order", () => {
  assert.equal(canonicalRequestHash({ b: 2, a: 1n }), canonicalRequestHash({ a: 1n, b: 2 }));
  assert.notEqual(canonicalRequestHash({ a: 1 }), canonicalRequestHash({ a: 2 }));
});
