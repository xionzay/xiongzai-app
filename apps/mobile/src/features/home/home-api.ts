import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/auth/runtime";
import type { CompanionApiView, CursorPage, ServiceApiView } from "@/types/api";

export interface HomeCatalog {
  companions: CompanionApiView[];
  services: ServiceApiView[];
}

export function useHomeCatalog() {
  return useQuery({
    queryKey: ["home", "catalog"],
    meta: { sessionIndependent: true },
    queryFn: async (): Promise<HomeCatalog> => {
      const [companions, services] = await Promise.all([
        apiClient.publicRequest<CursorPage<CompanionApiView>>("/companions?limit=20"),
        apiClient.publicRequest<CursorPage<ServiceApiView>>("/services?limit=20")
      ]);
      return { companions: companions.items, services: services.items };
    }
  });
}
