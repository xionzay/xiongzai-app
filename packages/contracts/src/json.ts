export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function toApiJson(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers cannot be serialized.");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => toApiJson(item) ?? null);
  }
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const serialized = toApiJson(item);
      if (serialized !== undefined) result[key] = serialized;
    }
    return result;
  }
  throw new TypeError(`Unsupported API JSON value: ${typeof value}`);
}
export function stringifyApiJson(value: unknown): string {
  return JSON.stringify(toApiJson(value));
}
