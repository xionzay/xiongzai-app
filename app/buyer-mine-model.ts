/** Presentation only: these links never grant seller permissions. */
export type BuyerSellerProfile = {
  status: string; suspended_reason?: string | null;
  latest_application?: { status: string; revision_kind?: string; rejection_reason?: string | null; required_fields?: string[]; submitted_at?: string | null; reviewed_at?: string | null } | null;
};
export function buyerIdentityEntry(profile: BuyerSellerProfile | null) {
  if (!profile) return { title: '申请成为陪玩', note: '提交资料，通过审核后开始接单', action: '填写申请', target: 'sellerApplyForm' };
  if (profile.status === 'APPROVED') return { title: '卖家工作台', note: '已入驻 · 管理服务与订单', action: '进入卖家工作台', target: 'seller' };
  if (['SUSPENDED', 'BANNED'].includes(profile.status)) return { title: '陪玩资格状态', note: profile.status === 'BANNED' ? '资格已封禁 · 查看原因' : '资格已暂停 · 查看原因', action: null, target: null };
  const state = profile.latest_application?.status ?? profile.status;
  if (['SUBMITTED', 'UNDER_REVIEW', 'PENDING_REVIEW'].includes(state)) return { title: '陪玩申请进度', note: '审核中 · 查看提交记录', action: null, target: null };
  if (state === 'NEEDS_SUPPLEMENT') return { title: '陪玩申请待补充', note: '查看需要补充的资料', action: '补充申请资料', target: 'sellerApplyForm' };
  if (state === 'REJECTED') return { title: '陪玩申请未通过', note: '查看审核原因', action: '修改申请资料', target: 'sellerApplyForm' };
  if (state === 'DRAFT') return { title: '继续陪玩申请', note: '申请资料尚未提交', action: '继续填写申请', target: 'sellerApplyForm' };
  return { title: '陪玩身份', note: '查看当前资格与申请记录', action: null, target: null };
}
export const mineOrderIcon: Record<string, string> = { '待付款': 'wallet', '待接单': 'mine-wait', '待服务': 'mine-wait', '服务中': 'service', '待确认': 'order', '待收货': 'order', '待评价': 'review', '售后': 'shield', '售后中': 'shield' };
