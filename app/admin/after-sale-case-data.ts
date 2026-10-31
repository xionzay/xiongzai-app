import type { AfterSaleCaseData } from "../../packages/contracts/src/after-sale-cases";
import { AdminApiError, adminApiRequest } from "./admin-api";

export type CaseSummary = { id: string; order_id: string; state: string; case_type: string; version: number; deadline_at: string | null };
export type CaseDetail = CaseSummary & AfterSaleCaseData & { requested_amount_cent: string; available_actions: string[] };
export type CaseHistory = { version: number; action: string; created_at: string; data: { from?: string; to?: string; reason?: string } };
export const caseStateLabels: Record<string, string> = {
  S01: "待商家回应", S02: "协商方案待回应", S03: "商家驳回待处理", S04: "售后结束，恢复原流程", S05: "协商未达成",
  R01: "补充履约中", R02: "补充履约待验收", P01: "平台初判", P02: "裁决回应期", P03: "一级复核", P04: "二级复核",
  EXECUTION_PENDING: "待执行（不代表到账）", F01: "退款执行中（未确认到账）", F02: "退款已完成", F06: "特殊案件已结束", REMEDY_COMPLETED: "补充履约已验收",
};
export const caseActionLabels: Record<string, string> = {
  CREATE: "提交申请", MODIFY: "修改申请", WITHDRAW: "撤回申请", APPROVE: "商家同意", REJECT: "商家驳回", OFFER: "提出方案", RESPOND: "回应方案",
  ESCALATE: "请求平台介入", ADD_EVIDENCE: "追加证据", SUBMIT_REMEDY: "提交补充履约", APPEND_REMEDY: "追加补充履约凭证", CONFIRM_REMEDY: "确认补充履约", EXTEND_REMEDY: "延长补充验收",
  MATERIALS_COMPLETE: "确认补证结束", EXTEND_MATERIALS: "延长补证期限", DECIDE: "提交裁决", ACCEPT_DECISION: "接受裁决", APPEAL: "提出申诉",
  RECHECK_FUNDING: "复查保全资金", RETRY_REFUND: "重试明确失败的 Mock 退款", CLOSE_SPECIAL: "关闭未生效特殊案件", MARK_EVIDENCE_SHAREABLE: "确认材料已脱敏", TIMEOUT: "到期处理",
};
export const caseLabel = (state: string) => caseStateLabels[state] ?? `未识别案件状态（${state}）`;
export function caseMoney(value: string): string {
  if (!/^\d{1,19}$/u.test(value)) return "金额不可用";
  const cent = BigInt(value); return `¥ ${(cent / 100n).toString()}.${(cent % 100n).toString().padStart(2, "0")}`;
}
const supported = new Set(["MATERIALS_COMPLETE", "EXTEND_MATERIALS", "DECIDE", "RECHECK_FUNDING", "RETRY_REFUND", "CLOSE_SPECIAL", "MARK_EVIDENCE_SHAREABLE"]);
export function adminCaseActions(row: CaseDetail, permissions: Set<string>) {
  if (!permissions.has("refund.read") || !permissions.has("refund.manage")) return [];
  return row.available_actions.filter(action => supported.has(action) && (action !== "EXTEND_MATERIALS" || permissions.has("refund.review.supervisor")));
}

/** One confirmation = one immutable command/key. Never replay a stale CAS command after 409. */
export function caseWrite(row: CaseDetail, payload: Record<string, unknown>, request = adminApiRequest) {
  const key = crypto.randomUUID(); let frozen: string | null = null, pending = false, conflict = false;
  let completed: { operation_result: unknown; current_case: CaseDetail } | null = null;
  return async (reason: string) => {
    if (conflict) throw new Error("记录已刷新，请关闭确认框，核对最新案件后重新操作。");
    if (pending) throw new Error("请求正在处理中，请勿重复提交。");
    if (reason.trim().length < 2 || reason.trim().length > 1000) throw new Error("操作原因须为 2–1000 个字符。");
    const body = JSON.stringify({ ...payload, version: row.version, ...(payload.action === "DECIDE" ? { decision: { ...(payload.decision as Record<string, unknown>), reason: reason.trim() } } : { reason: reason.trim() }) });
    if (frozen && frozen !== body) throw new Error("前次操作结果待确认，请保留原原因重试，或关闭后重新读取案件。");
    if (completed) return completed;
    frozen = body; pending = true;
    try {
      const result = await request<{ operation_result: unknown; current_case: CaseDetail }>(`/after-sale/cases/${row.id}/actions`, { method: "POST", headers: { "Idempotency-Key": key }, body });
      const current = result?.current_case;
      if (!result?.operation_result || !current || current.id !== row.id || !Number.isSafeInteger(current.version) || current.version <= row.version || !Array.isArray(current.available_actions)) {
        throw new AdminApiError("服务端未返回有效案件结果，请重新读取案件核对，不能认定操作成功。", "ADMIN_RESPONSE_INVALID", 502);
      }
      completed = result; return result;
    } catch (cause) { if (cause instanceof AdminApiError && cause.status === 409) conflict = true; throw cause; }
    finally { pending = false; }
  };
}
