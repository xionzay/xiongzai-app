export type SearchScope = "陪玩" | "服务";
export type SearchEntry = { scope: SearchScope; query: string };
export const SEARCH_HISTORY_LIMIT = 10;

export function addSearchHistory(entries: SearchEntry[], entry: SearchEntry): SearchEntry[] {
  const query = entry.query.trim();
  if (!query) return entries;
  const identity = query.normalize("NFKC").toLocaleLowerCase("zh-CN");
  return [{ scope: entry.scope, query }, ...entries.filter(row =>
    row.scope !== entry.scope || row.query.normalize("NFKC").toLocaleLowerCase("zh-CN") !== identity
  )].slice(0, SEARCH_HISTORY_LIMIT);
}

export function readSearchHistory(raw: string | null): SearchEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((row): row is SearchEntry => !!row &&
      (row.scope === "陪玩" || row.scope === "服务") && typeof row.query === "string" && !!row.query.trim());
    return valid.slice(0, SEARCH_HISTORY_LIMIT).reduceRight((rows, row) => addSearchHistory(rows, row), [] as SearchEntry[]);
  } catch { return []; }
}
