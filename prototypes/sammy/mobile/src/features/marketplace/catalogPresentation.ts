import type { PublicListing } from './listingModels';

const gameLooks = {
 peaceElite:{color:'#225B70',accent:'#BAF4DA',mark:'⌖',en:'Cloud Scout',zh:'云游',bioEn:'Easygoing company, clear callouts, and a calmer route to the final circle.',bioZh:'轻松开麦，清晰报点，一起稳稳走进决赛圈。'},
 deltaForce:{color:'#173E43',accent:'#C9EF7A',mark:'↗',en:'Echo',zh:'回声',bioEn:'Plan the route, watch each other’s backs, and make the extraction together.',bioZh:'一起规划路线、互相照应，享受协作撤离的乐趣。'},
 honorOfKings:{color:'#4C377A',accent:'#F5D79B',mark:'✧',en:'Mochi',zh:'糯米',bioEn:'A friendly lane partner with a soft spot for good teamwork.',bioZh:'喜欢默契配合的分路搭档，一起享受团队的高光时刻。'},
 valorant:{color:'#73354E',accent:'#FFC4C4',mark:'⌁',en:'Orbit',zh:'星轨',bioEn:'Thoughtful utility, friendly comms, and room to learn between rounds.',bioZh:'友好沟通，认真配合，在每个回合一起进步。'},
} as const;
export function gameLook(game:string){return gameLooks[game as keyof typeof gameLooks]??gameLooks.peaceElite;}
function sampleText(value:string,language:string){const parts=value.split(' / ');return language==='zh'?(parts[1]??parts[0]):parts[0];}
export function providerCopy(provider:{nickname:string;bio:string;isShowcase?:boolean},game:string,language:string){
 const look=gameLook(game);
 return provider.isShowcase?{name:language==='zh'?look.zh:look.en,bio:language==='zh'?look.bioZh:look.bioEn}:{name:provider.nickname,bio:provider.bio};
}
const serviceCopy={
 peaceElite:{companion:['Clear callouts, steady rotations, and a relaxed ranked pace.','清晰报点，稳健转移，轻松享受排位配合。'],coaching:['Build better positioning habits and learn when to rotate, hold, or take a fight.','练好站位与转移判断，学会何时推进、架枪或接战。']},
 deltaForce:{companion:['Coordinate your route, cover your teammate, and work towards a clean extraction.','规划行动路线，互相掩护，一起争取安全撤离。'],coaching:['Practice route planning, team spacing, and smarter extraction decisions.','练习路线规划、队伍间距与撤离决策，让行动更有章法。']},
 honorOfKings:{companion:['Find your rhythm with a friendly duo partner and thoughtful lane coordination.','和友好的双排搭档找到默契，享受分路配合的乐趣。'],coaching:['Understand draft choices, lane priorities, and the timing of your next rotation.','理解阵容选择、分路优先级与游走时机。']},
 valorant:{companion:['Friendly comms, thoughtful utility, and a teammate who plays the round with you.','友好开麦，认真配合道具，一起打好每个回合。'],coaching:['Sharpen crosshair placement, trading, and round decisions with custom-game drills.','通过自定义练习打磨准星位置、补枪配合与回合决策。']},
} as const;
export function listingCopy(listing:Pick<PublicListing,'title'|'description'|'isShowcase'|'game'|'serviceType'>,language:string){
 if(!listing.isShowcase)return {title:listing.title,description:listing.description};
 const copy=serviceCopy[listing.game]?.[listing.serviceType??'companion'];
 return {title:sampleText(listing.title,language),description:copy?.[language==='zh'?1:0]??sampleText(listing.description,language)};
}
