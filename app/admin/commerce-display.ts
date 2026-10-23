import { fulfillmentDurationLabel, productGameLabels } from "../../packages/contracts/src/commerce";

export const commerceValueLabels: Record<string, string> = {
  ...productGameLabels, legacy:"历史预约规则", SINGLE: "单价", MULTI: "多规格", IMAGE: "图片", VIDEO: "视频",
  ORDER_FULFILLMENT_IMAGE: "履约截图", ORDER_FULFILLMENT_VIDEO: "连续录屏",
  PRODUCT: "商品", SELLER: "卖家", NONE: "无售后", IN_PROGRESS: "售后中", RESOLVED: "已处理",
};
export const gameChoices = Object.entries(productGameLabels);
export { fulfillmentDurationLabel };

export type LinkedGovernanceKind = "USER" | "SELLER_SUSPEND" | "SELLER_BAN" | "PRODUCT";
export function canReadAndGovern(permissions: ReadonlySet<string>, kind: LinkedGovernanceKind) {
  const [read, manage] = kind === "USER" ? ["user.read", "user.status.manage"]
    : kind === "PRODUCT" ? ["product.read", "product.review"] : ["seller.read", "seller.status.manage"];
  return permissions.has(read!) && permissions.has(manage!);
}
