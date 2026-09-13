import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { clearSessionScopedCache } from "../src/query/session-cache";

test("清理失效登录态时保留无需登录的首页请求", async () => {
  const client = new QueryClient();
  await client.fetchQuery({
    queryKey: ["home", "catalog"],
    meta: { sessionIndependent: true },
    queryFn: async () => ({ companions: [{ id: "seller-1" }], services: [] })
  });
  await client.fetchQuery({
    queryKey: ["me"],
    queryFn: async () => ({ id: "user-1" })
  });

  clearSessionScopedCache(client);

  assert.deepEqual(client.getQueryData(["home", "catalog"]), {
    companions: [{ id: "seller-1" }],
    services: []
  });
  assert.equal(client.getQueryData(["me"]), undefined);
});
