export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export type ProfileFields = { seller_nickname: string; seller_avatar_file_id: string | null; cover_file_id: string | null; introduction: string | null; game_rank: string | null; kd: string | null; preferred_mode: string | null; play_style: string | null; game_experience: string | null; voice_file_id: string | null; voice_duration_ms: number | null };
export type Revision = { id: string; status: string; version: number; rejection_reason?: string | null; required_fields?: string[]; snapshot: ProfileFields };
export type Profile = ProfileFields & { id: string; user_id: string; status: string; accepting_orders: boolean; rating_avg: string; review_count: number; completed_order_count: number; favorite_count: number; version: number; pending_profile_revision?: Revision | null; latest_application?: Revision | null };
export type Product = { id: string; seller_id: string; title: string; description: string | null; cover_file_id: string | null; min_price_cent: string; sold_count: number; status: string; version: number; rating_avg: string; review_count: number; service_time_description: string | null; skus?: { id: string; sku_name: string; price_cent: string; duration_minutes: number; status: string }[] };
export type Review = { id: string; rating: number; content: string | null; display_nickname: string; service_title: string; created_at: string };
export type FileRecord = { id: string; file_type: string; mime_type: string; upload_status: string; moderation_status: string; access?: { url: string } };
export type ListState = { tab: '服务' | '评价' | '资料'; query: string; game: string; sort: string; scroll: number; expanded: boolean; reviews: Review[]; cursor?: string | null; reviewsLoaded?: boolean };
export const initialListState = (): ListState => ({ tab: '服务', query: '', game: '', sort: 'comprehensive', scroll: 0, expanded: false, reviews: [] });
export const fieldLabels: Record<keyof ProfileFields, string> = { seller_nickname: '店铺名称', seller_avatar_file_id: '头像', cover_file_id: '封面', introduction: '主页介绍', game_rank: '游戏段位', kd: 'K/D', preferred_mode: '主营游戏', play_style: '服务风格', game_experience: '游戏经历', voice_file_id: '声音名片', voice_duration_ms: '声音时长' };
export const fieldLimits: Partial<Record<keyof ProfileFields, number>> = { seller_nickname: 32, introduction: 1000, game_rank: 64, preferred_mode: 64, play_style: 128, game_experience: 500 };
export function profileFields(profile: ProfileFields): ProfileFields {
  return Object.fromEntries(Object.keys(fieldLabels).map(key => [key, profile[key as keyof ProfileFields] ?? null])) as ProfileFields;
}
export function validateProfile(draft: ProfileFields, revision: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.seller_nickname.trim().length < 2) errors.seller_nickname = '展示名称至少 2 个字';
  for (const [key, max] of Object.entries(fieldLimits)) if (String(draft[key as keyof ProfileFields] ?? '').trim().length > max) errors[key] = `${fieldLabels[key as keyof ProfileFields]}最多 ${max} 个字`;
  if (draft.kd && !/^\d{1,3}(\.\d{1,2})?$/.test(draft.kd)) errors.kd = '请输入最多三位整数、两位小数的 K/D';
  if (revision) for (const key of ['seller_avatar_file_id', 'introduction', 'preferred_mode'] as const) if (!String(draft[key] ?? '').trim()) errors[key] = `现有陪玩审核规则要求填写${fieldLabels[key]}`;
  return errors;
}
export function revisionPayload(draft: ProfileFields, seller: Profile, revision?: Revision | null) {
  return { ...profileFields(draft), seller_version: seller.version, ...(['DRAFT', 'NEEDS_SUPPLEMENT'].includes(revision?.status ?? '') ? { application_version: revision!.version } : {}) };
}
export function cropRect(width: number, height: number, ratio: number, zoom: number, x: number, y: number) {
  const w = Math.min(width, height * ratio) / Math.max(1, zoom), h = w / ratio;
  return { x: (width - w) * Math.max(0, Math.min(1, x)), y: (height - h) * Math.max(0, Math.min(1, y)), width: w, height: h };
}
export function priceLabel(product: Product) {
  const skus = product.skus?.filter(s => s.status === 'ACTIVE') ?? [];
  const prices = skus.map(s => BigInt(s.price_cent));
  const min = prices.length ? prices.reduce((a, b) => a < b ? a : b) : BigInt(product.min_price_cent);
  const varying = prices.some(p => p !== min);
  const cheapest = skus.find(s => BigInt(s.price_cent) === min);
  return { amount: (Number(min) / 100).toFixed(2), suffix: varying ? '起' : '', unit: cheapest ? `${cheapest.sku_name} · ${cheapest.duration_minutes} 分钟` : '具体规格见详情' };
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '请求失败，请重试';
