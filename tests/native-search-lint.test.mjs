import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();
const searchFiles = [
  "apps/mobile/src/features/chat/messages-screen.tsx",
  "apps/mobile/src/features/seller/seller-services-screen.tsx",
];
const nativeInput = 'import { TextInput } from "react-native"; export function Search() { return <TextInput autoFocus accessibilityLabel="搜索" />; }';
const htmlInput = 'export function Search() { return <input autoFocus aria-label="搜索" />; }';
async function autofocusMessages(source, filePath) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter(message => message.ruleId === "jsx-a11y/no-autofocus");
}

for (const file of searchFiles) {
  test(`native search exemption preserves TextInput semantics in ${file}`, async () => {
    assert.equal((await autofocusMessages(nativeInput, file)).length, 0);
  });
  test(`HTML autofocus remains forbidden in ${file}`, async () => {
    assert.equal((await autofocusMessages(htmlInput, file)).length, 1);
  });
}
test("native search exemption does not weaken autofocus rules in other files", async () => {
  assert.equal((await autofocusMessages(nativeInput, "apps/mobile/src/components/form-field.tsx")).length, 1);
  assert.equal((await autofocusMessages(htmlInput, "app/page.tsx")).length, 1);
});
