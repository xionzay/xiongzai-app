import type { AppEnvironment } from "@/config/runtime-flags";

export function verificationRequestMessage(environment: AppEnvironment): string {
  if (environment === "production") return "验证码已发送，请查看短信";
  return "测试环境验证码请求已受理，请使用本地配置的开发验证码。此提示不代表真实短信已送达。";
}
