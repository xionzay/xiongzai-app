import { totpCode } from "../dist/index.js";

if (process.env.NODE_ENV === "production" || process.env.DEPLOYMENT_ENV === "production") {
  throw new Error("生产环境禁止使用本地人工测试 TOTP 工具。");
}
const username = process.env.MANUAL_TEST_ADMIN_USERNAME;
const secret = process.env.MANUAL_TEST_ADMIN_TOTP_SECRET?.replaceAll(" ", "").toUpperCase();
if (!username || !secret || !/^[A-Z2-7]{16,128}$/u.test(secret)) throw new Error("本地人工测试管理员配置缺失或无效。");
process.stdout.write(`本地管理员 ${username} 当前 TOTP：${totpCode(secret)}（30 秒内有效）\n`);
