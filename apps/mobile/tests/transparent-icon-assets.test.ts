import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(process.cwd());
const componentSource = readFileSync(path.join(mobileRoot, "src/components/tab-icons.tsx"), "utf8");
const favoriteButtonSource = readFileSync(path.join(mobileRoot, "src/features/favorites/favorite-button.tsx"), "utf8");
const fileImageSource = readFileSync(path.join(mobileRoot, "src/components/file-image.tsx"), "utf8");
const safeImageSource = readFileSync(path.join(mobileRoot, "src/components/safe-image.tsx"), "utf8");
const iconNames = ["home", "order", "message", "mine", "service", "wallet", "shield", "setting", "favorite", "coupon", "withdraw", "favorite-action-outline", "favorite-action-filled", "message-action"];

test("设计图标全部使用真正带 Alpha 的透明 PNG，不再使用白底原图", () => {
  for (const name of iconNames) {
    const file = readFileSync(path.join(mobileRoot, `assets/transparent-icons/${name}.png`));
    assert.equal(file.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(file[25], 6, `${name}.png 必须是 RGBA PNG`);
    assert.match(componentSource, new RegExp(`transparent-icons/${name}\\.png`, "u"));
  }

  assert.doesNotMatch(componentSource, /assets\/icon-(?:home|order|message|mine|service|wallet|shield|setting)\.png/u);
  assert.doesNotMatch(componentSource, /backgroundColor:\s*["']#FFFFFF["']/u);
});

test("收藏前后使用设计稿同源轮廓、实心状态和 200ms 回弹动画", () => {
  assert.match(componentSource, /favoriteActionFilled/u);
  assert.match(componentSource, /favoriteActionOutline/u);
  assert.match(componentSource, /scale\.setValue\(0\.82\)/u);
  assert.match(componentSource, /toValue: 1\.08, duration: 140/u);
  assert.match(componentSource, /toValue: 1, duration: 60/u);
  assert.match(componentSource, /selected \? "#FF5A1F" : color/u);
  assert.match(favoriteButtonSource, /<Text style=\{styles\.companionLabel\}>收藏陪玩<\/Text>/u);
  assert.match(favoriteButtonSource, /<Text style=\{styles\.serviceLabel\}>收藏服务<\/Text>/u);
  assert.doesNotMatch(favoriteButtonSource, /active \? "已收藏" : "收藏陪玩"/u);
});

test("真实文件缺失或加载失败时如实显示占位，不用默认图掩盖", () => {
  assert.doesNotMatch(fileImageSource, /fallbackSource/u);
  assert.doesNotMatch(safeImageSource, /fallbackSource/u);
  assert.match(fileImageSource, /图片暂不可用/u);
  assert.match(safeImageSource, /onError=\{\(\) => setFailed\(true\)\}/u);
});
