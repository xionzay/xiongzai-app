import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileTypeFromBuffer } from 'file-type';
import { parseBuffer, TrackType } from 'music-metadata';
import { ApiError } from './validation.js';
import { CloudinaryStorage } from './cloudinary-storage.js';
export type UploadSlot={url:string;method:'PUT'|'POST';fields?:Record<string,string>};
export interface MediaStorage {
 createUpload(key:string,mime:string,bytes:number):Promise<UploadSlot>;
 downloadUrl(key:string):Promise<string>;
 read(key:string,maximum:number):Promise<Buffer>;
 store(key:string,bytes:Buffer,mime:string):Promise<void>;
 remove(key:string):Promise<void>;
}
export class ObjectStorage implements MediaStorage {
  private client:S3Client;
  constructor(private bucket:string,endpoint:string,accessKeyId:string,secretAccessKey:string){this.client=new S3Client({region:'auto',endpoint,credentials:{accessKeyId,secretAccessKey}});}
  static fromEnvironment():MediaStorage|undefined{
    const {CLOUDINARY_CLOUD_NAME,CLOUDINARY_API_KEY,CLOUDINARY_API_SECRET}=process.env;
    if(CLOUDINARY_CLOUD_NAME||CLOUDINARY_API_KEY||CLOUDINARY_API_SECRET){
      if(!CLOUDINARY_CLOUD_NAME||!CLOUDINARY_API_KEY||!CLOUDINARY_API_SECRET)throw new Error('All three CLOUDINARY credentials are required.');
      return new CloudinaryStorage(CLOUDINARY_CLOUD_NAME,CLOUDINARY_API_KEY,CLOUDINARY_API_SECRET);
    }
    const {S3_BUCKET,S3_ENDPOINT,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY}=process.env;
    return S3_BUCKET&&S3_ENDPOINT&&S3_ACCESS_KEY_ID&&S3_SECRET_ACCESS_KEY ? new ObjectStorage(S3_BUCKET,S3_ENDPOINT,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY) : undefined;
  }
  async uploadUrl(key:string,mime:string,bytes:number){return getSignedUrl(this.client,new PutObjectCommand({Bucket:this.bucket,Key:key,ContentType:mime,ContentLength:bytes}),{expiresIn:300});}
  async createUpload(key:string,mime:string,bytes:number):Promise<UploadSlot>{return {url:await this.uploadUrl(key,mime,bytes),method:'PUT'};}
  async downloadUrl(key:string){return getSignedUrl(this.client,new GetObjectCommand({Bucket:this.bucket,Key:key}),{expiresIn:300});}
  async read(key:string,maximum:number){
    const result=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));
    if(!result.Body||!result.ContentLength||result.ContentLength>maximum) { (result.Body as any)?.destroy?.(); throw new ApiError(400,'invalidMedia'); }
    const chunks:Buffer[]=[];let length=0;
    for await(const chunk of result.Body as AsyncIterable<Uint8Array>){length+=chunk.length;if(length>maximum){(result.Body as any).destroy?.();throw new ApiError(400,'invalidMedia');}chunks.push(Buffer.from(chunk));}
    return Buffer.concat(chunks);
  }
  async store(key:string,bytes:Buffer,mime:string){await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:bytes,ContentType:mime}));}
  async remove(key:string){await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}));}
}
export async function inspectMedia(bytes:Buffer,kind:'avatar'|'voice'|'evidenceImage'|'evidenceVideo',expectedMime:string){
  let type:Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try{type=await fileTypeFromBuffer(bytes);}catch{throw new ApiError(400,'invalidMedia');}
  const aliases:Record<string,string>={'audio/x-m4a':'audio/mp4','video/mp4':'audio/mp4','audio/aac':'audio/aac'};
  const mime=type ? (kind==='evidenceVideo'?type.mime:aliases[type.mime]??type.mime) : '';
  if(mime!==expectedMime) throw new ApiError(400,'invalidMedia');
  if(kind==='avatar'||kind==='evidenceImage'){
    if(!['image/jpeg','image/png','image/webp'].includes(mime)||bytes.length>8*1024*1024) throw new ApiError(400,'invalidMedia');
    return {mime,extension:mime==='image/jpeg'?'jpg':mime.slice(6),durationMs:null};
  }
  if(kind==='evidenceVideo'){
    if(mime!=='video/mp4'||bytes.length>50*1024*1024)throw new ApiError(400,'invalidMedia');
    try{const meta=await parseBuffer(bytes,{mimeType:mime},{duration:true});if(!meta.format.trackInfo?.some(track=>track.type===TrackType.video)||!meta.format.duration||!Number.isFinite(meta.format.duration))throw new Error();return {mime,extension:'mp4',durationMs:Math.round(meta.format.duration*1000)};}catch{throw new ApiError(400,'invalidMedia');}
  }
  if(!['audio/mp4','audio/mpeg','audio/aac'].includes(mime)||bytes.length>10*1024*1024) throw new ApiError(400,'invalidMedia');
  let durationMs:number;
  try{const meta=await parseBuffer(bytes,{mimeType:mime},{duration:true});if(meta.format.trackInfo?.some(track=>track.type===TrackType.video))throw new ApiError(400,'invalidMedia');durationMs=Math.round((meta.format.duration??0)*1000);}catch{throw new ApiError(400,'invalidMedia');}
  if(!Number.isFinite(durationMs)||durationMs<10000||durationMs>30000) throw new ApiError(400,'invalidVoiceDuration');
  return {mime,extension:mime==='audio/mp4'?'m4a':mime==='audio/mpeg'?'mp3':'aac',durationMs};
}
