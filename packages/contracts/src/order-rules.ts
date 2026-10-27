import { AppError } from "./errors.js";

// Internal execution version, independent of the legal policy document IDs.
// Assign another version only when its complete handlers are ready to ship.
export const LEGACY_APPOINTMENT_RULE_VERSION = 1;

export function assertLegacyOrderRules(order: { transactionRuleVersion: number }): void {
  if (order.transactionRuleVersion !== LEGACY_APPOINTMENT_RULE_VERSION) {
    throw new AppError({
      code: "ORDER_RULE_VERSION_UNSUPPORTED",
      message: "当前服务暂不支持此订单的交易规则，请稍后重试或联系平台客服",
      statusCode: 409,
    });
  }
}
