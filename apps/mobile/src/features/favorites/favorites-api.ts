import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { apiClient } from "@/auth/runtime";
import { optimisticFavorites } from "@/features/favorites/favorites-domain";
import type { FavoriteApiView, FavoriteTargetType } from "@/types/api";

export const favoritesKey = ["favorites"] as const;

export function useFavorites(enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: favoritesKey, enabled, initialPageParam: "",
    queryFn: ({ pageParam, signal }) => apiClient.request<{ items: FavoriteApiView[]; next_cursor: string | null }>(`/favorites?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    getNextPageParam: (page) => page.next_cursor ?? undefined
  });
  return { ...query, items: query.data?.pages.flatMap((page) => page.items) ?? [] };
}

export function useFavoriteStatus(type: FavoriteTargetType, id: string, enabled: boolean) {
  return useQuery({ queryKey: ["favorite-status", type, id], enabled, queryFn: ({ signal }) => apiClient.request<{ favorited: boolean }>(`/favorites/${type}/${id}`, { signal }) });
}

export function useFavoriteMutation(type: FavoriteTargetType, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (favorited: boolean) => apiClient.request<{ favorited: boolean }>(`/favorites/${type}/${id}`, { method: favorited ? "DELETE" : "PUT" }),
    onMutate: async (favorited) => {
      await client.cancelQueries({ queryKey: favoritesKey });
      const previous = client.getQueryData<InfiniteData<{ items: FavoriteApiView[]; next_cursor: string | null }>>(favoritesKey);
      client.setQueryData<InfiniteData<{ items: FavoriteApiView[]; next_cursor: string | null }>>(favoritesKey, (current) => {
        if (!current) return current;
        const pages = current.pages.map((page) => ({ ...page, items: optimisticFavorites(page.items, type, id, true) }));
        if (!favorited && pages[0]) pages[0] = { ...pages[0], items: optimisticFavorites(pages[0].items, type, id, false) };
        return { ...current, pages };
      });
      client.setQueryData(["favorite-status", type, id], { favorited: !favorited });
      return { previous };
    },
    onError: (_error, favorited, context) => { client.setQueryData(favoritesKey, context?.previous); client.setQueryData(["favorite-status", type, id], { favorited }); },
    onSettled: () => { void client.invalidateQueries({ queryKey: favoritesKey }); void client.invalidateQueries({ queryKey: ["favorite-status", type, id] }); }
  });
}
