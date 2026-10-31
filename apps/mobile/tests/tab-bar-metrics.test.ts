import assert from "node:assert/strict";
import test from "node:test";
import { tabBarMetrics } from "../src/components/tab-bar-metrics";

test("买家 Tab 内容和手势安全区分别占位，不让文字落入手势条", () => {
  assert.deepEqual(tabBarMetrics("buyer", 1, 24), { itemHeight: 68, paddingBottom: 24, height: 96 });
  assert.deepEqual(tabBarMetrics("buyer", 1, 34), { itemHeight: 68, paddingBottom: 34, height: 106 });
});

test("大字体增加 Tab 标签所需高度，不靠关闭字体缩放压回布局", () => {
  assert.deepEqual(tabBarMetrics("buyer", 1.3, 24), { itemHeight: 74, paddingBottom: 24, height: 102 });
  assert.deepEqual(tabBarMetrics("buyer", 2, 24), { itemHeight: 86, paddingBottom: 24, height: 114 });
});

test("陪玩 Tab 同样保留安全区和自身字体空间", () => {
  assert.deepEqual(tabBarMetrics("seller", 1, 24), { itemHeight: 67, paddingBottom: 24, height: 96 });
  assert.deepEqual(tabBarMetrics("seller", 1.3, 24), { itemHeight: 73, paddingBottom: 24, height: 102 });
});

test("无手势区、小字体或无效指标安全回退且不缩小触控区域", () => {
  assert.deepEqual(tabBarMetrics("buyer", 0.85, 0), { itemHeight: 68, paddingBottom: 8, height: 80 });
  assert.deepEqual(tabBarMetrics("seller", Number.NaN, -1), { itemHeight: 67, paddingBottom: 5, height: 77 });
  assert.equal(Number.isFinite(tabBarMetrics("buyer", Number.POSITIVE_INFINITY, Number.NaN).height), true);
});
