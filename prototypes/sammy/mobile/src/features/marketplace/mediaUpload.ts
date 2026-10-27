import * as FileSystem from 'expo-file-system/legacy';
export type MediaUploadSlot={id:string;url:string;method?:'PUT'|'POST';fields?:Record<string,string>};
export async function sendMedia(slot:MediaUploadSlot,uri:string,mime:string,timeout=120000){
 const options:FileSystem.FileSystemUploadOptions=slot.method==='POST'
  ?{httpMethod:'POST',uploadType:FileSystem.FileSystemUploadType.MULTIPART,fieldName:'file',mimeType:mime,parameters:slot.fields??{}}
  :{httpMethod:'PUT',uploadType:FileSystem.FileSystemUploadType.BINARY_CONTENT,headers:{'Content-Type':mime}};
 const task=FileSystem.createUploadTask(slot.url,uri,options),timer=setTimeout(()=>void task.cancelAsync(),timeout);
 try{const result=await task.uploadAsync();if(!result||result.status<200||result.status>=300)throw new Error('hostedMediaUnavailable');}
 finally{clearTimeout(timer);}
}
