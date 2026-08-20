import assert from "node:assert/strict";
import { test } from "node:test";
const compiledModuleUrl = new URL("../dist/ids.js", import.meta.url);

test("uuidv7 factory emits RFC 9562 version/variant and sortable timestamp prefix", async () => {
  const { uuidv7 } = await import(compiledModuleUrl);
  const earlier = uuidv7(1_700_000_000_000);
  const later = uuidv7(1_700_000_000_001);

  assert.match(earlier, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(earlier.slice(0, 13) < later.slice(0, 13));
});

test("uuidv7 rejects invalid timestamps", async () => {
  const { uuidv7 } = await import(compiledModuleUrl);
  assert.throws(() => uuidv7(-1), RangeError);
  assert.throws(() => uuidv7(Number.MAX_SAFE_INTEGER), RangeError);
});
