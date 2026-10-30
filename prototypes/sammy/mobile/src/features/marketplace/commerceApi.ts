import { api,readToken } from './hostedApi';
import * as FileSystem from 'expo-file-system/legacy';
import { sendMedia, type MediaUploadSlot } from './mediaUpload';
export type CommerceObject=Record<string,any>;
export type WorkflowView={order:CommerceObject;workflow:{version:number;data:CommerceObject}|null;cases:CommerceObject[];allowedActions:string[];allowedActionFields:Record<string,string[]>;evidence:{id:string;kind:string;url:string|null}[];events:CommerceObject[];simulationEnabled:boolean};
export async function commerceApi<T=CommerceObject>(path:string,body?:unknown,method=body===undefined?'GET':'POST'){const token=await readToken();if(!token)throw new Error('signInRequired');return api<T>(path,token,body,method);}
export async function uploadEvidence(uri:string,name:string,size?:number){
 const ext=name.split('.').at(-1)?.toLowerCase()??'',mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp4:'video/mp4'} as Record<string,string>)[ext];
 if(!mime)throw new Error('invalidMedia');const info=await FileSystem.getInfoAsync(uri);if(!info.exists||info.isDirectory)throw new Error('invalidMedia');const bytes=size??info.size;
 const kind=mime.startsWith('video/')?'evidenceVideo':'evidenceImage';const slot=await commerceApi<MediaUploadSlot>('/media',{kind,mime,bytes});
 await sendMedia(slot,uri,mime);await commerceApi('/media/'+slot.id+'/complete',{});return slot.id;
}
