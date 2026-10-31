import { isFulfillmentOrder, fulfillmentHoursToSeconds } from '../packages/contracts/src/commerce';

export { isFulfillmentOrder };
import { productGameLabels } from '../packages/contracts/src/commerce'; export const gameNames = productGameLabels;
export type Game = keyof typeof gameNames;
export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export type BusinessFile = { id: string; file_type: string; mime_type: string; upload_status: string; moderation_status: string; visibility: string; bound_review_id?: string | null };
export type Product = { id: string; title: string; description: string; status: string; version: number; game?: Game | null; fulfillment_seconds?: number | null; pricing_mode?: 'SINGLE' | 'MULTI'; cover_file_id?: string | null; service_time_description?: string | null; skus?: { id: string; sku_name: string; price_cent: string; status: string; version?: number; duration_minutes?: number | null }[]; images?: { file_id: string; image_kind?: 'GALLERY' | 'DETAIL'; is_cover: boolean; sort_order: number }[] };
export type ConnectedOrder = { id: string; order_no: string; product_title: string; sku_name: string; quantity: number; version: number; status: string; payment_status: string; after_sale_status: string; rule_version?: string; fulfillment_seconds?: number | null; fulfillment_due_at?: string | null; auto_confirm_at?: string | null; receipt_extension_used?: boolean; evidence_review_pending?: boolean; last_reminded_at?: string | null; fulfillment_evidence?: { file_id: string; kind: 'IMAGE' | 'VIDEO' }[]; available_actions?: string[]; seller_available_actions?: string[]; after_sale_capabilities?: Record<string, boolean>; payable_amount_cent: string; paid_amount_cent: string; platform_fee_cent: string; seller_income_cent: string; refunded_amount_cent: string };

// Parse decimal input without ever converting authoritative cents to floating point.
export function yuanInputToCent(value: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('价格须为正数，最多两位小数');
  const [whole, part = ''] = value.trim().split('.');
  const cents = BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'));
  if (cents < 1n || cents > 9223372036854775807n) throw new Error('价格超出允许范围');
  return cents.toString();
}
export function money(value: string): string { const cents = BigInt(value); return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`; }
export function hoursToSeconds(hours: string): number {
  return fulfillmentHoursToSeconds(hours);
}
export function evidenceError(files: BusinessFile[], paid: string): string {
  if (new Set(files.map(file => file.id)).size !== files.length) return '凭证不能重复';
  if (files.some(file => file.visibility !== 'PRIVATE' || file.upload_status !== 'VERIFIED' || file.moderation_status !== 'APPROVED' || !['ORDER_FULFILLMENT_IMAGE', 'ORDER_FULFILLMENT_VIDEO'].includes(file.file_type))) return '请先完成文件校验及后台人工审核';
  if (files.filter(file => file.file_type === 'ORDER_FULFILLMENT_IMAGE').length < 5) return '至少需要 5 张已审核截图';
  if (BigInt(paid) >= 20000n && !files.some(file => file.file_type === 'ORDER_FULFILLMENT_VIDEO')) return '实付达到 200 元，需要已人工核验的连续录屏';
  return '';
}
export function businessError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const copy: Record<string, string> = { RESOURCE_VERSION_CONFLICT: '内容已在其他设备更新，请读取最新版本后重试', ORDER_PRICE_CHANGED: '价格已变化，请重新核对订单预览', ORDER_SERVICE_UNAVAILABLE: '商品已下架或不可购买', ORDER_IDENTITY_REQUIRED: '交易双方须完成实名审核', ORDER_ADULT_VERIFICATION_REQUIRED: '交易双方须满足实名成年条件', POLICY_ACCEPTANCE_REQUIRED: '请阅读并确认当前协议版本', ORDER_EVIDENCE_REVIEW_PENDING: '凭证核查中，暂不能确认收货', ORDER_EXTENSION_EXHAUSTED: '本单已使用一次 24 小时延期', ORDER_REMIND_RATE_LIMITED: '催促冷却中，请稍后再试', ORDER_STATE_INVALID: '订单状态已变化，请刷新', ORDER_ACTION_NOT_SUPPORTED: '此操作尚未开放', PAYMENT_ALREADY_PAYING: '已有付款处理中，请查询原付款记录', UNAUTHORIZED: '请先登录', ORDER_EVIDENCE_IMAGES_REQUIRED: '至少需要 5 张有效截图', ORDER_EVIDENCE_VIDEO_REQUIRED: '本单需要连续录屏', FILE_VIDEO_CONTINUITY_REVIEW_REQUIRED: '录屏仍需后台人工确认连续性' };
  // Do not expose server exception text, credentials, signed URLs or private input.
  return copy[code] ?? '操作未完成，请刷新后重试；未产生客户端成功确认';
}
