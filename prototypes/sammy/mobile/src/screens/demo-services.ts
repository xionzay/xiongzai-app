import type { TranslationKey } from '../i18n/LanguageProvider';
export interface DemoService {
  id: string; name: string; initials: string; category: 'relaxed' | 'ranked';
  title: TranslationKey; description: TranslationKey; pricesFen: Record<'duo' | 'squad', number>; tint: string;
  maxQuantity: number; fulfillmentHours: number;
}
// Names are user content: they deliberately stay unchanged when UI language changes.
export const demoServices: DemoService[] = [
  { id: '1', name: '小蓝 · Lan', initials: '蓝', category: 'relaxed', title: 'casualTitle', description: 'casualDescription', pricesFen: { duo: 3900, squad: 4900 }, tint: '#DCEFFF', maxQuantity: 4, fulfillmentHours: 24 },
  { id: '2', name: '星辰 · Chen', initials: '辰', category: 'ranked', title: 'rankedTitle', description: 'rankedDescription', pricesFen: { duo: 5900, squad: 6900 }, tint: '#E5EAFE', maxQuantity: 3, fulfillmentHours: 24 },
  { id: '3', name: '阿夏 · Xia', initials: '夏', category: 'relaxed', title: 'eveningTitle', description: 'eveningDescription', pricesFen: { duo: 4500, squad: 5500 }, tint: '#E0F4EF', maxQuantity: 4, fulfillmentHours: 24 },
];
