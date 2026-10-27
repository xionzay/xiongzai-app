import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from './db.js';
import { media } from './schema.js';
import { ApiError } from './validation.js';
import type { MediaStorage } from './storage.js';

export async function ownedMedia(db:Pick<Database,'select'>,ownerId:string,id:string,kind:'avatar'|'voice'){
 const item=(await db.select().from(media).where(eq(media.id,id)))[0];
 if(!item||item.ownerId!==ownerId)throw new ApiError(403,'mediaNotOwned');
 if(item.kind!==kind||item.status!=='ready')throw new ApiError(409,'mediaNotReady');
 return item;
}
export async function mediaFiles(db:Pick<Database,'select'>,storage:MediaStorage|undefined,ids:(string|null|undefined)[]){
 const unique=[...new Set(ids.filter((id):id is string=>!!id))];
 if(!unique.length)return [];
 const files=await db.select().from(media).where(and(inArray(media.id,unique),eq(media.status,'ready')));
 return Promise.all(files.map(async item=>({id:item.id,kind:item.kind,file:`${item.kind}-${item.id}.${item.key.split('.').at(-1)}`,durationMs:item.durationMs,url:storage?await storage.downloadUrl(item.key):null})));
}
