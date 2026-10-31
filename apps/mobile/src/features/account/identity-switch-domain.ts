import { sellerEntry } from '../seller/seller-domain';
import type { SellerProfileApiView } from '@/types/api';

export function identitySwitchTarget(role: 'buyer' | 'seller', seller: SellerProfileApiView | null) {
  if (role === 'seller') return '/(buyer-tabs)' as const;
  const entry = sellerEntry(seller?.status ?? 'NOT_APPLIED', seller?.latest_application?.status);
  if (entry === 'CENTER') return '/(seller-tabs)' as const;
  if (['APPLY', 'EDIT_DRAFT', 'SUPPLEMENT', 'REJECTED'].includes(entry)) return '/seller/apply' as const;
  return '/seller/status' as const;
}

export function identitySwitchPresentation(role: 'buyer' | 'seller', seller: SellerProfileApiView | null) {
  if (role === 'seller') return { label: '切换为“买家”身份', note: '同一账号，订单与资料继续保留' };
  const entry = sellerEntry(seller?.status ?? 'NOT_APPLIED', seller?.latest_application?.status);
  const copy = {
    APPLY: { label: '申请入驻成为卖家', note: '完成入驻并通过平台审核后，才可以切换卖家身份' },
    EDIT_DRAFT: { label: '继续入驻申请', note: '入驻申请尚未提交，通过审核后才可以切换卖家身份' },
    WAITING: { label: '查看审核进度', note: '入驻审核中，审核通过前不能切换卖家身份' },
    SUPPLEMENT: { label: '补充入驻资料', note: '请按审核意见补充资料，通过审核后才可以切换卖家身份' },
    REJECTED: { label: '修改入驻申请', note: '入驻审核未通过，修改资料并通过审核后才可以切换卖家身份' },
    CENTER: { label: '切换为“卖家”身份', note: '入驻审核已通过，可以切换卖家身份' },
    SUSPENDED: { label: '查看资格状态', note: '卖家资格已暂停，当前不能切换卖家身份' },
    BANNED: { label: '查看资格状态', note: '卖家资格已封禁，当前不能切换卖家身份' }
  };
  return copy[entry];
}
