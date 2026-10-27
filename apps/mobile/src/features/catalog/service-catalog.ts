export type CategorySnapshot = { id: string; name: string; version: number; fields: Array<{ key: string; label: string; required: boolean }> };
export type BillingUnit = "SESSION" | "MATCH" | "HOUR";
export function validUnitCount(value: string) { return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1000; }
export function packageLabel(sku: { billing_unit?: string; unit_count?: number }) { return `${sku.unit_count ?? 1} ${({ SESSION: "次", MATCH: "局", HOUR: "小时" } as Record<string, string>)[sku.billing_unit ?? "SESSION"] ?? "次"}`; }
