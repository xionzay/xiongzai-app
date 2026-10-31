/** Pure client contract: no authentication, signing, storage or Node dependencies. */
import type { AfterSaleCaseData, AfterSaleCaseKind, AfterSaleCaseState } from './after-sale-cases.js';

export interface CaseSummary { id: string; order_id: string; state: AfterSaleCaseState; case_type: AfterSaleCaseKind; version: number; deadline_at: string | null }
export interface CaseDetail extends CaseSummary, AfterSaleCaseData { requested_amount_cent: string; available_actions: string[] }
export interface CaseHistory { version: number; action: string; created_at: string; data: { from?: string; to?: string; reason?: string } }
export interface CasePage { items: CaseSummary[]; next_after_id: string | null }
export interface CaseHistoryPage { items: CaseHistory[]; next_after_version: number | null }
export interface CaseResult { operation_result: unknown; current_case: CaseDetail }
export type CaseRequest = <T>(path: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<T>;
export const caseStates: Record<string, string> = {
  S01: '待商家处理', S02: '协商方案待回应', S03: '商家已驳回', S04: '售后结束，恢复履约', S05: '待第二轮方案',
  R01: '同案补充履约中', R02: '补充履约待验收', P01: '平台处理中', P02: '裁决待回应', P03: '第一次申诉', P04: '第二次申诉及终审',
  EXECUTION_PENDING: '待执行（尚未满足渠道执行条件）', F01: '退款处理中（尚未确认成功）', F02: '实际退款已完成', F06: '特殊案件已结案', REMEDY_COMPLETED: '补充履约已验收',
};
export const userCaseActions = {
  MODIFY: '修改申请', WITHDRAW: '撤回申请', APPROVE: '同意退款', REJECT: '驳回并举证', OFFER: '提出协商方案', RESPOND: '回应协商方案', ESCALATE: '申请平台介入', ADD_EVIDENCE: '补充案件证据',
  SUBMIT_REMEDY: '提交补充履约完成', APPEND_REMEDY: '追加补充履约凭证', CONFIRM_REMEDY: '确认补充履约验收', EXTEND_REMEDY: '延长补充验收 24 小时', ACCEPT_DECISION: '接受当前裁决', APPEAL: '对当前裁决申诉',
} as const;
export type UserCaseAction = keyof typeof userCaseActions;
export function allowedUserActions(row: CaseDetail): UserCaseAction[] { return row.available_actions.filter((key): key is UserCaseAction => Object.hasOwn(userCaseActions, key)); }
export function centDisplay(value: string): string { if (!/^\d{1,19}$/u.test(value)) return '金额不可用'; const n = BigInt(value); return `${n / 100n}.${String(n % 100n).padStart(2, '0')}`; }
export function caseError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const known: Record<string, string> = {
    RESOURCE_VERSION_CONFLICT: '案件已更新，请重新读取并核对，原确认不会自动重放。', CASE_ACTION_REQUIRED: '本退款须在售后案件中处理。',
    CASE_EVIDENCE_REQUIRED: '请先提交相关且已审核的证据。', CASE_EVIDENCE_INVALID: '证据用途、归属、审核或绑定不符合要求。',
    CASE_NEW_EVIDENCE_REQUIRED: '第二级申诉必须提供新的已审核证据。', CASE_AMOUNT_INVALID: '请填写有效的整数分金额。', REFUND_AMOUNT_EXCEEDS_REMAINING: '金额超出剩余可退范围。',
    CASE_APPLICATION_LIMIT: '自助申请次数已用完，请联系平台核验。', CASE_SUPPORT_REQUIRED: '交易已终结，请联系客服核验特殊受理资格。',
    CASE_STATE_INVALID: '当前案件状态不允许该操作，请刷新。', CASE_DEADLINE_EXPIRED: '操作期限已结束，请刷新案件。',
    ORDER_EVIDENCE_IMAGES_REQUIRED: '至少需要五张有效截图。', ORDER_EVIDENCE_VIDEO_REQUIRED: '本单须提供已审核连续录屏。',
    UNAUTHORIZED: '请重新登录。', FORBIDDEN: '当前账号没有此操作权限。',
  };
  return known[code] ?? '操作结果未确认，请读取最新案件；不要重复新建操作。';
}
export interface CaseForm { reason?: string; amount?: string; reasonCode?: string; kind?: 'REFUND' | 'REMEDY'; retained?: string; delivery?: string; content?: string; quantity?: string; standard?: string; seconds?: string; accept?: boolean; terminated?: boolean; fileIds?: string[] }
export function casePayload(row: CaseDetail, action: UserCaseAction, form: CaseForm): Record<string, unknown> {
  if (!allowedUserActions(row).includes(action)) throw new Error('当前案件未开放此操作，请刷新。');
  const reason = () => { const value = form.reason?.trim() ?? ''; if (value.length < 2 || value.length > 1000) throw new Error('请填写 2–1000 字说明。'); return value; };
  const cents = (value?: string) => { if (!value || !/^\d{1,19}$/u.test(value)) throw new Error('金额必须为整数分字符串。'); return BigInt(value).toString(); };
  const files = form.fileIds ?? [];
  if (files.length > 30 || new Set(files).size !== files.length) throw new Error('证据最多 30 个，不能重复（临时测试限制）。');
  const base = { action, version: row.version };
  switch (action) {
    case 'MODIFY': return { ...base, amount_cent: cents(form.amount), reason_code: form.reasonCode || 'SERVICE_ISSUE', reason_text: reason() };
    case 'WITHDRAW': case 'APPROVE': case 'ESCALATE': return { ...base, reason: reason() };
    case 'REJECT': if (!files.length) throw new Error('驳回必须选择相关已审核证据。'); return { ...base, reason: reason(), file_ids: files };
    case 'ADD_EVIDENCE': case 'SUBMIT_REMEDY': case 'APPEND_REMEDY': if (!files.length) throw new Error('请选择已审核材料。'); return { ...base, file_ids: files };
    case 'RESPOND': if (!row.offer || typeof form.accept !== 'boolean') throw new Error('请明确选择接受或拒绝当前方案。'); return { ...base, offer_id: row.offer.id, accept: form.accept };
    case 'ACCEPT_DECISION': case 'APPEAL': if (!row.decision) throw new Error('当前没有有效裁决。'); return { ...base, decision_id: row.decision.id, ...(action === 'APPEAL' ? { reason: reason(), file_ids: files } : {}) };
    case 'OFFER': {
      if (form.kind === 'REMEDY') {
        const seconds = Number(form.seconds); if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 604800 || !form.content?.trim() || !form.quantity?.trim() || !form.standard?.trim()) throw new Error('请填写补充履约内容、数量、标准及 1–604800 秒期限。');
        return { ...base, offer: { kind: 'REMEDY', content: form.content.trim(), quantity: form.quantity.trim(), standard: form.standard.trim(), fulfillment_seconds: seconds } };
      }
      if (!form.delivery?.trim() || !form.terminated) throw new Error('请写明已认可交付/成本，并明确确认剩余未交付义务终止。');
      return { ...base, offer: { kind: 'REFUND', amount_cent: cents(form.amount), retained_amount_cent: cents(form.retained), recognized_delivery: form.delivery.trim(), remaining_obligations_terminated: true } };
    }
    default: return base;
  }
}

/** One explicit confirmation, immutable bytes/key, single in-flight request; no automatic replay. */
export function caseSubmission(request: CaseRequest, row: CaseDetail, payload: Record<string, unknown>, key: string) {
  const body = JSON.stringify(payload); let busy = false, stale = false; let completed: CaseResult | null = null;
  return async (): Promise<CaseResult> => {
    if (stale) throw new Error('案件版本已变化，请重新读取并再次确认。');
    if (busy) throw new Error('正在提交，请勿重复点击。');
    if (completed) return completed;
    busy = true;
    try {
      const result = await request<CaseResult>(`/after-sale/cases/${row.id}/actions`, { method: 'POST', headers: { 'Idempotency-Key': key }, body });
      if (!result?.operation_result || result.current_case?.id !== row.id || !Number.isSafeInteger(result.current_case.version) || result.current_case.version <= row.version || !Array.isArray(result.current_case.available_actions)) throw new Error('响应未确认，请刷新案件核对结果。');
      completed = result; return result;
    } catch (error) { if (error && typeof error === 'object' && (('status' in error && error.status === 409) || ('code' in error && error.code === 'RESOURCE_VERSION_CONFLICT'))) stale = true; throw error; }
    finally { busy = false; }
  };
}
export interface ReviewImage { file_id: string; position: number; content_path: string }
export function reviewImagePath(reviewId: string, image: ReviewImage): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  if (!uuid.test(reviewId) || !uuid.test(image.file_id)) return null;
  const path = `/api/v1/files/review-images/${reviewId}/${image.file_id}/content`;
  return image.content_path === path ? path : null;
}
