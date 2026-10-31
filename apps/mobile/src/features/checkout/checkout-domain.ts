import type { AvailabilityApiView, OrderApiView, OrderDraftApi, OrderPreviewApiView, PaymentApiView, ServiceSkuApiView } from "@/types/api";
import type { PaymentChannel } from "@xiongzai/contracts";

export interface StartOption {
  slotId: string;
  startsAt: string;
  endsAt: string;
  dayLabel: string;
  timeLabel: string;
}

export type PaymentOutcome = "success" | "failed" | "cancelled" | "closed" | "processing";

const pollDelays = [1_000, 2_000, 4_000, 6_000, 8_000, 10_000] as const;
const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

// Hermes devices can fall back to English despite requesting zh-CN. Keep the
// device's existing local timezone without depending on locale data for labels.
function localDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekDays[date.getDay()]}`;
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export class SingleFlight {
  private current: Promise<unknown> | null = null;
  get busy() { return this.current !== null; }
  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.current) return this.current as Promise<T>;
    const pending = operation().finally(() => { if (this.current === pending) this.current = null; });
    this.current = pending;
    return pending;
  }
}

export function buildStartOptions(slots: AvailabilityApiView[], durationMinutes: number, now = new Date(), stepMinutes = 30): StartOption[] {
  const duration = durationMinutes * 60_000;
  const step = stepMinutes * 60_000;
  const result: StartOption[] = [];
  for (const slot of slots) {
    if (slot.status !== "OPEN") continue;
    const slotStart = new Date(slot.starts_at).getTime();
    const slotEnd = new Date(slot.ends_at).getTime();
    if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd) || slotEnd <= now.getTime()) continue;
    let candidate = Math.max(slotStart, now.getTime() + 5 * 60_000);
    if (candidate > slotStart) candidate = Math.ceil(candidate / step) * step;
    while (candidate + duration <= slotEnd && result.length < 120) {
      const start = new Date(candidate);
      const end = new Date(candidate + duration);
      result.push({
        slotId: slot.id,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        dayLabel: localDay(start),
        timeLabel: `${localTime(start)}–${localTime(end)}`
      });
      candidate += step;
    }
  }
  return result;
}

export function checkoutFingerprint(draft: OrderDraftApi): string {
  return [draft.product_id, draft.sku_id ?? "default", draft.slot_id ?? "", draft.quantity, draft.service_starts_at ? new Date(draft.service_starts_at).toISOString() : "", draft.buyer_note?.trim() ?? ""].join("|");
}

export function previewFingerprint(preview: OrderPreviewApiView): string {
  return [preview.product_id, preview.sku_id, preview.sku_price_cent, preview.quantity, preview.payable_amount_cent, preview.service_starts_at, preview.service_ends_at].join("|");
}

export function selectedSku(skus: ServiceSkuApiView[], skuId: string): ServiceSkuApiView | undefined {
  return skus.find((sku) => sku.id === skuId && sku.status === "ACTIVE");
}

export function paymentPollDelay(attempt: number): number | null {
  return pollDelays[attempt] ?? null;
}

export function resolvePaymentOutcome(payment: PaymentApiView | undefined, order: OrderApiView | undefined): PaymentOutcome {
  if (payment?.status === "PAID" || order?.payment_status === "PAID") return "success";
  if (order && ["CANCELLED", "CLOSED", "SELLER_REJECTED"].includes(order.status)) return "closed";
  // An order cached from the previous payment attempt may still say FAILED
  // while the newly selected payment is loading or PAYING. Only that payment
  // can establish failure; never apply an older attempt's failure to it.
  if (payment?.status === "FAILED") return "failed";
  if (payment?.status === "CLOSED") return "cancelled";
  return "processing";
}

export function paymentChannelLabel(channel: PaymentChannel): string {
  return channel === "WECHAT_APP" ? "微信支付（测试）" : "支付宝支付（测试）";
}

export function canPayOrder(order: OrderApiView): boolean {
  return order.status === "PENDING_PAYMENT" && !["PAID", "CLOSED"].includes(order.payment_status) && new Date(order.expires_at).getTime() > Date.now();
}

export function orderErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    ORDER_IDENTITY_REQUIRED: "交易前需要有效的人工实名认证；当前测试账号尚未满足要求，不能继续下单。",
    ORDER_ADULT_VERIFICATION_REQUIRED: "交易前需要可核验的成年实名信息，当前条件未满足。",
    POLICY_ACCEPTANCE_REQUIRED: "请先主动确认当前交易规则，再重新读取服务端价格。",
    PLATFORM_CONFIG_MISSING: "测试环境尚未启用订单或财务配置，暂时不能获取价格或下单。",
    PLATFORM_CONFIG_INVALID: "测试环境的订单或财务配置无效，请联系平台处理。",
    ORDER_PRICE_CHANGED: "服务价格已经变化，请确认最新金额后再下单。",
    ORDER_SLOT_CONFLICT: "这个时间刚刚被其他用户预约，请重新选择。",
    ORDER_SLOT_UNAVAILABLE: "所选预约时间已经失效，请重新选择。",
    ORDER_SERVICE_UNAVAILABLE: "服务已下架或暂不可购买。",
    ORDER_SELLER_UNAVAILABLE: "陪玩当前暂停接单，请选择其他服务。",
    ORDER_SKU_UNAVAILABLE: "所选规格已经失效，请重新选择。",
    PAYMENT_PROVIDER_UNAVAILABLE: "测试支付渠道暂时不可用，请稍后重试。",
    PAYMENT_ALREADY_PAYING: "订单已有支付正在处理中，请查询原支付结果。",
    ORDER_STATE_INVALID: "订单状态已经变化，请刷新后重试。",
    ORDER_NOT_PAYABLE: "订单当前无法支付，可能已付款、取消或过期。请重新查询订单状态，不要重复付款。",
    PAYMENT_STATE_INVALID: "支付状态已经变化，请重新查询订单与原支付结果，不要重复付款。",
    RESOURCE_VERSION_CONFLICT: "订单状态已更新，请刷新后重试。",
    NETWORK_TIMEOUT: "网络请求超时。订单或支付可能已经创建，请使用原操作安全重试。"
  };
  return messages[code] ?? "请求未完成，请稍后重试。";
}

export function formatServiceTime(value: string | null | undefined): string {
  if (!value) return "无预约时间";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${localDay(date)} ${localTime(date)}` : "预约时间不可用";
}
