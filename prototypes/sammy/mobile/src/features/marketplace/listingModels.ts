import type { RemoteFile } from './hostedProfile';
export type Listing = { id:string;title:string;description:string;game:'peaceElite'|'deltaForce'|'honorOfKings'|'valorant';mode:'duo'|'squad';category:'relaxed'|'ranked';priceFen:number;photoMediaIds:string[];revision:number;status:'draft'|'published';serviceType?:'companion'|'coaching';reviewStatus?:'draft'|'pending'|'approved'|'changes_requested';reviewReason?:string|null;isShowcase?:boolean };
export type ListingDraft = Omit<Listing,'revision'|'status'|'photoMediaIds'> & {revision:number;photoFiles:string[]};
export type OwnerListings = {listings:Listing[];files:RemoteFile[]};
export type PublicListing = Omit<Listing,'status'> & {ownerId?:string;provider:{id?:string;nickname:string;bio:string;rank:string;playStyle:string;avatarMediaId:string|null;voiceMediaId:string|null;isShowcase?:boolean};files:RemoteFile[]};
export function listingPrice(text:string):number|null {
 if(!/^\d{1,4}(\.\d{1,2})?$/.test(text.trim()))return null;
 const [whole,part='']=text.trim().split('.');const fen=Number(whole)*100+Number(part.padEnd(2,'0'));
 return Number.isSafeInteger(fen)&&fen>=100&&fen<=100000?fen:null;
}
