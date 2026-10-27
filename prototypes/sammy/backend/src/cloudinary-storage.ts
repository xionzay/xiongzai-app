import { v2 as cloudinary } from 'cloudinary';
import type { MediaStorage, UploadSlot } from './storage.js';
import { ApiError } from './validation.js';

// Raw authenticated assets preserve the exact uploaded bytes for validation and
// evidence hashing. No public CDN URLs or transformations are generated.
export class CloudinaryStorage implements MediaStorage {
 private options;
 constructor(cloudName:string,apiKey:string,apiSecret:string){
  if(!/^[a-zA-Z0-9_-]+$/.test(cloudName))throw new Error('Invalid Cloudinary cloud name.');
  this.options={cloud_name:cloudName,api_key:apiKey,api_secret:apiSecret,secure:true};
 }
 async createUpload(key:string):Promise<UploadSlot>{
  const params={public_id:key,type:'authenticated',overwrite:'false',timestamp:String(Math.floor(Date.now()/1000))};
  return {url:`https://api.cloudinary.com/v1_1/${this.options.cloud_name}/raw/upload`,method:'POST',fields:{...params,api_key:this.options.api_key,signature:cloudinary.utils.api_sign_request(params,this.options.api_secret)}};
 }
 async downloadUrl(key:string){
  // Signed CDN URLs do not expire. Use Cloudinary's download API instead.
  const options={...this.options,resource_type:'raw' as const,type:'authenticated' as const,expires_at:Math.floor(Date.now()/1000)+300,attachment:false};
  return cloudinary.utils.private_download_url(key,'',options);
 }
 async read(key:string,maximum:number){
  const response=await fetch(await this.downloadUrl(key),{signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.body)throw new ApiError(502,'hostedMediaUnavailable');
  const length=Number(response.headers.get('content-length'));
  if(length>maximum){await response.body.cancel();throw new ApiError(400,'invalidMedia');}
  const reader=response.body.getReader(),chunks:Buffer[]=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maximum){await reader.cancel();throw new ApiError(400,'invalidMedia');}chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  if(!bytes)throw new ApiError(400,'invalidMedia');
  return Buffer.concat(chunks);
 }
 async store(key:string,bytes:Buffer,mime:string){
  await new Promise<void>((resolve,reject)=>{
   const stream=cloudinary.uploader.upload_stream({...this.options,resource_type:'raw',type:'authenticated',public_id:key,overwrite:false,timeout:60000},(error,result)=>{
    if(error||!result||result.public_id!==key||result.bytes!==bytes.length||result.type!=='authenticated')reject(new ApiError(502,'hostedMediaUnavailable'));else resolve();
   });
   stream.on('error',()=>reject(new ApiError(502,'hostedMediaUnavailable')));stream.end(bytes);
  });
 }
 async remove(key:string){const options={...this.options,resource_type:'raw' as const,type:'authenticated' as const,invalidate:true,timeout:30000};await cloudinary.uploader.destroy(key,options);}
}
