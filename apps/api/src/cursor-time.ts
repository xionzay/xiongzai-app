import { getTableColumns, sql, type AnyColumn, type Table, type SQL } from "drizzle-orm";
import { AppError, errorCodes } from "@xiongzai/contracts";

/** Keep PostgreSQL microseconds at the serialization boundary, without changing
 * chronological ordering or changing the public Date-shaped record contract. */
export function cursorTimestamp(column: AnyColumn) {
  return sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.mapWith((value: string) => {
    const date = new Date(value);
    Object.defineProperty(date, "toISOString", { value: () => value });
    return date;
  });
}

export function cursorColumns<T extends Table & { createdAt: AnyColumn }>(table: T): Omit<T["_"]["columns"], "createdAt"> & { createdAt: SQL<Date> } {
  const { createdAt: _original, ...columns } = getTableColumns(table);
  void _original;
  return { ...columns, createdAt: cursorTimestamp(table.createdAt) };
}

/** Pass the signed timestamp to PostgreSQL as text, not through JS Date (ms). */
export function cursorTimeValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,19) !== value.slice(0,19)) {
    throw new AppError({ code: errorCodes.VALIDATION_FAILED, message: "分页游标时间无效，请重新加载列表", statusCode: 400 });
  }
  return sql`${value}::timestamptz`;
}
