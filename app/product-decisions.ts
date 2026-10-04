/** V3.5 display decisions. Does not alter transaction state or historical snapshots. */
export const PRODUCT_GAMES = ['和平精英', '三角洲行动', '王者荣耀', '无畏契约'] as const;
export function publicGames(text: string) { return PRODUCT_GAMES.filter(game => text.includes(game) || (game === '和平精英' && text.includes('地铁逃生'))); }
export function offersCompanion(introduction?: string | null) { return !!introduction && /陪玩/.test(introduction) && !/不提供陪玩|不接陪玩|不做陪玩|没有陪玩/.test(introduction); }
export function noticeGroup(item: {category: string; related_type?: string | null; notification_type?: string}) {
  if (item.category === 'FEEDBACK' || item.related_type === 'FEEDBACK') return '反馈';
  if (item.category === 'AFTER_SALE' || ['REFUND','AFTER_SALE','COMPLAINT'].includes(item.related_type ?? '') || /REFUND|AFTER_SALE/.test(item.notification_type ?? '')) return '售后';
  return ({ORDER:'订单',ACCOUNT:'账户',PLATFORM:'平台'} as Record<string,string>)[item.category] ?? '平台';
}
