import assert from "node:assert/strict";
import test from "node:test";
import { ChatMediaConfirmationError, chatMediaReady, shouldMountChatRecorder, uploadChatMedia } from "../src/features/chat/chat-media-upload";
import { HttpPollingChatTransport } from "../src/features/chat/chat-transport";
import { ChatOutboxStore } from "../src/storage/chat-outbox";
import { MemorySecureStore } from "./test-helpers";
import type { ApiClient } from "../src/api/client";
import type { ImageUploadDependencies } from "../src/features/files/file-upload-domain";
import type { FileApiView, FilePolicyApiView } from "../src/types/api";

const fileId = "00000000-0000-4000-8000-000000000001";
test("iOS 权限弹窗 inactive 不卸载录音器，真正后台和未知状态仍卸载",()=>{
  assert.equal(shouldMountChatRecorder("active"),true);
  assert.equal(shouldMountChatRecorder("inactive"),true);
  assert.equal(shouldMountChatRecorder("background"),false);
  assert.equal(shouldMountChatRecorder("unknown"),false);
  assert.equal(shouldMountChatRecorder("extension"),false);
});
const file: FileApiView = { id:fileId, owner_user_id:"owner",file_type:"CHAT_VOICE",mime_type:"audio/mp4",size_bytes:4,width:null,height:null,duration_ms:2000,upload_status:"VERIFIED",moderation_status:"PENDING",visibility:"PRIVATE",created_at:"2026-10-25T00:00:00Z",updated_at:"2026-10-25T00:00:00Z" };
const policy: FilePolicyApiView = { file_type:"CHAT_VOICE",mime_types:["audio/mp4"],maximum_bytes:100,visibility:"PRIVATE",minimum_duration_ms:1000,maximum_duration_ms:60000 };
function dependencies(completeFails=false) {
  const calls: string[]=[]; let puts=0;
  const adapter: ImageUploadDependencies={
    readBytes:async()=>new Uint8Array([1,2,3,4]),sha256:async()=>"a".repeat(64),put:async()=>{ puts++; },
    request:async<T>(path: string)=>{
      calls.push(path);
      if(path==="/files/uploads") return {file,upload:{url:"https://upload.test",method:"PUT",headers:{},expires_at:"2026-10-25"}} as T;
      if(completeFails) throw new TypeError("offline");
      return file as T;
    }
  };
  return {adapter,calls,puts:()=>puts};
}
test("聊天音频真实上传策略、直传、确认顺序，不复用声音名片用途",async()=>{
  const mock=dependencies();
  const result=await uploadChatMedia({type:"VOICE",uri:"file:///local.m4a",mimeType:"audio/mp4",durationMs:2000},[policy],new AbortController().signal,()=>{},mock.adapter);
  assert.equal(result.moderation_status,"PENDING"); assert.equal(chatMediaReady(result),false);
  assert.equal(chatMediaReady({...result,moderation_status:"APPROVED"}),true);
  assert.equal(chatMediaReady({...result,moderation_status:"APPROVED",file_type:"VOICE_SAMPLE"}),false);
  assert.deepEqual(mock.calls,["/files/uploads",`/files/${fileId}/complete`]); assert.equal(mock.puts(),1);
});
test("PUT 完成但确认失败保留 file_id，不删除、不再 PUT",async()=>{
  const mock=dependencies(true);
  await assert.rejects(uploadChatMedia({type:"VOICE",uri:"file:///local.m4a",mimeType:"audio/mp4"},[policy],new AbortController().signal,()=>{},mock.adapter),error=>error instanceof ChatMediaConfirmationError && error.file.id===fileId && error.retryable);
  assert.equal(mock.puts(),1); assert.equal(mock.calls.length,2);
});
test("语音时长、用途缺失和中止在申请上传前拒绝",async()=>{
  for(const durationMs of [999,60001]) {
    const mock=dependencies(); await assert.rejects(uploadChatMedia({type:"VOICE",uri:"local",mimeType:"audio/mp4",durationMs},[policy],new AbortController().signal,()=>{},mock.adapter)); assert.equal(mock.calls.length,0);
  }
  const mock=dependencies(), aborted=new AbortController(); aborted.abort();
  await assert.rejects(uploadChatMedia({type:"VOICE",uri:"local",mimeType:"audio/mp4"},[policy],aborted.signal,()=>{},mock.adapter));
  await assert.rejects(uploadChatMedia({type:"VOICE",uri:"local",mimeType:"audio/mp4"},[],new AbortController().signal,()=>{},mock.adapter)); assert.equal(mock.calls.length,0);
});
test("媒体发送只提交服务端 file_id，冷启动同一媒体复用 client_message_id",async()=>{
  const bodies:string[]=[];
  const client={request:async(_path:string,options:{body:string})=>{bodies.push(options.body);return {};}} as unknown as ApiClient;
  const transport=new HttpPollingChatTransport(client); const media={type:"VOICE" as const,fileId};
  await transport.sendMessage("c1","same-client","摘要",undefined,media);
  assert.deepEqual(JSON.parse(bodies[0]!),{client_message_id:"same-client",message_type:"VOICE",file_id:fileId});
  assert.throws(()=>transport.sendMessage("c1","same-client","",undefined,{...media,fileId:"file:///private.m4a"}));
  const storage=new MemorySecureStore();let id=0; const next=()=>String(++id);
  const outbox=new ChatOutboxStore(storage,next);const first=await outbox.prepare("c1","[语音]",undefined,media);
  await outbox.failed("c1",first);
  const restored=new ChatOutboxStore(storage,next);const retry=await restored.prepare("c1","[语音]",undefined,media);
  assert.equal(first.clientMessageId,retry.clientMessageId);
  const different=await restored.prepare("c1","[语音]",undefined,{...media,fileId:"00000000-0000-4000-8000-000000000002"});
  assert.notEqual(different.clientMessageId,first.clientMessageId);
  await restored.clearAll();assert.equal(await restored.read("c1"),null);
});
