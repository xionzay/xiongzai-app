export type PaymentExceptionKind = "价格变化" | "服务失效" | "渠道异常" | "订单状态";

const serviceCodes = new Set(["ORDER_SERVICE_UNAVAILABLE", "ORDER_SELLER_UNAVAILABLE", "ORDER_SKU_UNAVAILABLE", "ORDER_SLOT_UNAVAILABLE", "ORDER_SLOT_CONFLICT", "ORDER_STATE_INVALID", "RESOURCE_VERSION_CONFLICT"]);

export function exceptionKind(code: string): PaymentExceptionKind {
  if (code === "ORDER_PRICE_CHANGED") return "价格变化";
  if (code === "ORDER_NOT_PAYABLE" || code === "PAYMENT_STATE_INVALID") return "订单状态";
  if (serviceCodes.has(code)) return "服务失效";
  return "渠道异常";
}

export function exceptionTitle(code: string, kind: PaymentExceptionKind): string {
  if (kind === "价格变化") return "订单金额已更新";
  if (code === "ORDER_NOT_PAYABLE") return "订单当前无法支付";
  if (code === "PAYMENT_STATE_INVALID") return "支付状态已变化";
  if (code === "ORDER_SELLER_UNAVAILABLE") return "陪玩暂停接单";
  if (["ORDER_SLOT_UNAVAILABLE", "ORDER_SLOT_CONFLICT"].includes(code)) return "预约时间已失效";
  if (kind === "服务失效") return "当前服务不可购买";
  if (code === "PAYMENT_ALREADY_PAYING") return "已有支付正在确认中";
  if (code === "NETWORK_TIMEOUT") return "网络连接超时";
  return code === "PAYMENT_PROVIDER_UNAVAILABLE" ? "支付渠道暂时不可用" : "支付请求未完成";
}
