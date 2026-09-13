import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, errorCodes } from "./errors.js";

export interface CursorPayload {
  sort_value: string;
  id: string;
  scope?: string;
}
export interface CursorPageRequest {
  cursor?: string;
  limit: number;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

const MAX_PAGE_SIZE = 100;

export function normalizePageSize(value: unknown, defaultValue = 20): number {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    throw new AppError({
      code: errorCodes.VALIDATION_FAILED,
      message: `limit 必须是 1 到 ${MAX_PAGE_SIZE} 的整数`,
      statusCode: 400,
      fieldErrors: [{ field: "limit", code: "OUT_OF_RANGE", message: `limit 必须是 1 到 ${MAX_PAGE_SIZE} 的整数` }],
    });
  }
  return parsed;
}

export function encodeCursor(payload: CursorPayload, secret: string): string {
  assertCursorSecret(secret);
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function decodeCursor(cursor: string, secret: string): CursorPayload {
  assertCursorSecret(secret);
  const [data, suppliedSignature, extra] = cursor.split(".");
  if (!data || !suppliedSignature || extra) throw invalidCursor();
  const expectedSignature = createHmac("sha256", secret).update(data).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    throw invalidCursor();
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw invalidCursor();
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (typeof payload.sort_value !== "string" || typeof payload.id !== "string" || !payload.id) throw invalidCursor();
    if (payload.scope !== undefined && typeof payload.scope !== "string") throw invalidCursor();
    return { sort_value: payload.sort_value, id: payload.id, ...(payload.scope ? { scope: payload.scope } : {}) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalidCursor();
  }
}

function assertCursorSecret(secret: string): void {
  if (Buffer.byteLength(secret) < 32) throw new Error("Cursor signing secret must be at least 32 bytes.");
}

function invalidCursor(): AppError {
  return new AppError({ code: errorCodes.VALIDATION_FAILED, message: "分页游标无效", statusCode: 400 });
}
