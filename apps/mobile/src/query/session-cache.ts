import type { QueryClient } from "@tanstack/react-query";

const sessionIndependentFlag = "sessionIndependent";

export function clearSessionScopedCache(client: QueryClient): void {
  client.removeQueries({
    predicate: (query) => query.meta?.[sessionIndependentFlag] !== true
  });
  client.getMutationCache().clear();
}
