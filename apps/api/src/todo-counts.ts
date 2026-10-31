/** Sum already-authorized database aggregates on the server, never in the UI. */
export function todoCounts<T extends string>(items: Array<{ target_module: T; count: number }>): Map<T, number> {
  const result = new Map<T, number>();
  for (const item of items) result.set(item.target_module, (result.get(item.target_module) ?? 0) + item.count);
  return result;
}
