import { platformConfigs, type DatabaseClient, type DatabaseTransaction } from "@xiongzai/database";
import { and, desc, eq, inArray, lte, or, isNull } from "drizzle-orm";
import { AppError } from "@xiongzai/contracts";

export const PRODUCT_IMAGE_HARD_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_HARD_MAX_COUNT = 30;

export async function productImageLimits(db: DatabaseClient["db"] | DatabaseTransaction) {
  const rows = await db.select({ key: platformConfigs.configKey, value: platformConfigs.valueJson }).from(platformConfigs)
    .where(and(inArray(platformConfigs.configKey, ["product.image_max_count", "product.image_max_bytes"]), eq(platformConfigs.status, "ACTIVE"), or(isNull(platformConfigs.effectiveAt), lte(platformConfigs.effectiveAt, new Date()))))
    .orderBy(desc(platformConfigs.versionNo));
  function value(key: string, fallback: number, minimum: number) {
    const configured = rows.find(row => row.key === key);
    if (!configured) return fallback;
    const n = configured.value && typeof configured.value === "object" ? (configured.value as { value?: unknown }).value : undefined;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < minimum || n > fallback) throw new AppError({ code: "PLATFORM_CONFIG_INVALID", message: `配置无效：${key}`, statusCode: 503 });
    return n;
  }
  return { maximumCount: value("product.image_max_count", PRODUCT_IMAGE_HARD_MAX_COUNT, 1), maximumBytes: value("product.image_max_bytes", PRODUCT_IMAGE_HARD_MAX_BYTES, 1024) };
}
