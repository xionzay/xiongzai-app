export function mergeSupportMessages<T extends { id: string; sequence_no: string | number }>(current: T[], incoming: T[]): T[] {
  const rows = new Map(current.map(row => [row.id, row]));
  incoming.forEach(row => rows.set(row.id, row));
  return [...rows.values()].sort((a, b) => BigInt(a.sequence_no) < BigInt(b.sequence_no) ? -1 : BigInt(a.sequence_no) > BigInt(b.sequence_no) ? 1 : 0);
}

export function localDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
