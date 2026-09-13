import assert from "node:assert/strict";
import test from "node:test";
import { resolveQueryOnlineState } from "../src/query/query-online-state";

test("development keeps local API queries enabled without public internet reachability", () => {
  assert.equal(resolveQueryOnlineState({
    isConnected: true,
    isInternetReachable: false,
    appEnvironment: "development"
  }), true);
});

test("production requires both a network connection and internet reachability", () => {
  assert.equal(resolveQueryOnlineState({
    isConnected: true,
    isInternetReachable: false,
    appEnvironment: "production"
  }), false);
  assert.equal(resolveQueryOnlineState({
    isConnected: false,
    isInternetReachable: true,
    appEnvironment: "production"
  }), false);
  assert.equal(resolveQueryOnlineState({
    isConnected: true,
    isInternetReachable: true,
    appEnvironment: "production"
  }), true);
});
