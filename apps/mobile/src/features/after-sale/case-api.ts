import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { CaseDetail, CaseHistoryPage, CasePage } from '@xiongzai/contracts/after-sale-client';
import { apiClient } from '@/auth/runtime';
export function useAfterSaleCase(id: string) { return useQuery({ queryKey: ['after-sale-case',id], enabled: !!id, retry:false, queryFn: ({signal}) => apiClient.request<CaseDetail>(`/after-sale/cases/${id}`,{signal}) }); }
export function useAfterSaleCases() { return useInfiniteQuery({ queryKey:['after-sale-cases'], initialPageParam:'', queryFn:({pageParam,signal})=>apiClient.request<CasePage>(`/after-sale/cases?limit=20${pageParam?`&after_id=${encodeURIComponent(pageParam)}`:''}`,{signal}),getNextPageParam:page=>page.next_after_id??undefined }); }
export function useCaseHistory(id:string) { return useInfiniteQuery({queryKey:['case-history',id],enabled:!!id,initialPageParam:-1,queryFn:({pageParam,signal})=>apiClient.request<CaseHistoryPage>(`/after-sale/cases/${id}/history?after_version=${pageParam}`,{signal}),getNextPageParam:page=>page.next_after_version??undefined}); }
