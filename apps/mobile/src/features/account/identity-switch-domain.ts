import { sellerEntry } from '../seller/seller-domain';
import type { SellerProfileApiView } from '@/types/api';

export function identitySwitchTarget(role: 'buyer' | 'seller', seller: SellerProfileApiView | null) {
  if (role === 'seller') return '/(buyer-tabs)' as const;
  return seller && sellerEntry(seller.status, seller.latest_application?.status) === 'CENTER' ? '/(seller-tabs)' as const : '/seller/status' as const;
}
