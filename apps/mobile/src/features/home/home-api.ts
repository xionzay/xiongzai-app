import { useInfiniteQuery } from "@tanstack/react-query";
import type { ProductGame } from "@xiongzai/contracts/commerce";
import { apiClient } from "@/auth/runtime";
import { catalogPath, type CatalogKind, type CatalogSort } from "./home-domain";
import type { CompanionApiView, CursorPage, ServiceApiView } from "@/types/api";

export interface HomeCatalog {
  companions: CompanionApiView[];
  services: ServiceApiView[];
}

export function useCatalog<T extends CompanionApiView | ServiceApiView>(kind: CatalogKind, sort: CatalogSort = "comprehensive", game: ProductGame | "ALL" = "ALL") {
  return useInfiniteQuery({
    queryKey: ["home", "catalog", kind, sort, game],
    meta: { sessionIndependent: true },
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => apiClient.publicRequest<CursorPage<T>>(catalogPath(kind, sort, game, pageParam), { signal }),
    getNextPageParam: page => page.next_cursor ?? undefined
  });
}
