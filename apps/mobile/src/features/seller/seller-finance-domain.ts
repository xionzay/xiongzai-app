import { z } from "zod";
import type { WithdrawalStatus } from "@/types/api";

export const payoutAccountSchema = z.object({
  accountType: z.enum(["WECHAT", "ALIPAY"]),
  holderName: z.string().trim().min(2, "请输入真实收款人姓名").max(64),
  accountToken: z.string().trim().min(3, "请输入有效收款账号").max(128)
});
export type PayoutAccountValues = z.infer<typeof payoutAccountSchema>;

export function yuanInputToCent(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/u.test(normalized)) return null;
  const [yuan = "0", fraction = ""] = normalized.split(".");
  return (BigInt(yuan) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

export function validateWithdrawalCent(amount: string, available: string, min: string, max: string): string | null {
  const value = BigInt(amount);
  if (value < BigInt(min)) return "提现金额低于平台最低限额";
  if (value > BigInt(max)) return "提现金额超过平台最高限额";
  if (value > BigInt(available)) return "可提现余额不足";
  return null;
}

export const withdrawalStatusCopy: Record<WithdrawalStatus, string> = {
  CREATED: "待审核", RISK_REVIEW: "风险审核", APPROVED: "已审核", PAYOUT_PROCESSING: "渠道处理中",
  COMPLETED: "提现完成", REJECTED: "已拒绝", FAILED: "提现失败", CLOSED: "已关闭"
};

export function isMaskedAccount(value: string): boolean { return value.includes("*") && !/^[\w.+-]+@[\w.-]+$/u.test(value); }

export function formatBps(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return "—";
  const raw = String(value).padStart(3, "0");
  return `${raw.slice(0, -2)}.${raw.slice(-2)}%`;
}

export class SingleFlightAction {
  private pending: Promise<unknown> | null = null;
  run<T>(action: () => Promise<T>): Promise<T> {
    if (this.pending) return this.pending as Promise<T>;
    const request = action().finally(() => { if (this.pending === request) this.pending = null; });
    this.pending = request;
    return request;
  }
}
