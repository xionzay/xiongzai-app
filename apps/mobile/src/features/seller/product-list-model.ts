import type { SellerProductStatus, SellerServiceApiView } from '@/types/api';
export const productTabs: { label: string; values: SellerProductStatus[] }[] = [
  { label: '在售', values: ['ON_SALE'] }, { label: '已下架', values: ['OFF_SALE', 'ADMIN_OFF_SALE'] },
  { label: '草稿', values: ['DRAFT'] }, { label: '待审核', values: ['PENDING_REVIEW'] }, { label: '审核驳回', values: ['REVIEW_REJECTED'] }
];
export function visibleSellerProducts(rows: readonly SellerServiceApiView[], label: string, keyword: string, priceAscending: boolean) {
  const statuses = (productTabs.find(tab => tab.label === label) ?? productTabs[0]!).values;
  const search = keyword.trim().toLocaleLowerCase();
  return rows.filter(row => statuses.includes(row.status) && (row.title + row.id).toLocaleLowerCase().includes(search)).sort((a, b) => {
    if (priceAscending) { const x = BigInt(a.min_price_cent), y = BigInt(b.min_price_cent); if (x !== y) return x < y ? -1 : 1; }
    return Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.id.localeCompare(b.id);
  });
}
