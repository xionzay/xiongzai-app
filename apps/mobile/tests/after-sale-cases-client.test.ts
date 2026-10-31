import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewImagesHarness} from './review-images-harness';
import {casePayload,caseSubmission,type CaseDetail} from '@xiongzai/contracts/after-sale-client';
type Element={type:unknown;props:Record<string,unknown>};
function nodes(value:unknown):Element[]{if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object'||!('props'in value))return[];const e=value as Element;return[e,...nodes(e.props.children)];}
const id='00000000-0000-4000-8000-000000000001',file='00000000-0000-4000-8000-000000000002';
test('真实 App 评价组件只使用审核策略、file_id 与受控内容地址，隐藏评价不渲染图片',async()=>{
  const component=reviewImagesHarness(2),selected:string[][]=[];
  const tree=nodes(component.ReviewImagesPicker({ids:[id],onChange:(ids:string[])=>selected.push(ids)}));
  const picker=tree.find(e=>e.type==='ImageUploadSlot')!;assert.equal(picker.props.fileType,'REVIEW_IMAGE');assert.equal(picker.props.selectionOnly,true);assert.equal(picker.props.expectedVisibility,'PRIVATE');
  await (picker.props.onReady as (file:{id:string})=>Promise<void>)({id:file});assert.deepEqual(Array.from(selected[0]!),[id,file]);
  const full=nodes(component.ReviewImagesPicker({ids:[id,file],onChange:()=>{throw Error('must not exceed policy');}})).find(e=>e.type==='ImageUploadSlot')!;
  await assert.rejects((full.props.onReady as (file:{id:string})=>Promise<void>)({id:'third'}),/selection_limit/);
  const review={id,status:'PUBLIC',images:[{file_id:file,content_path:`/api/v1/files/review-images/${id}/${file}/content`}]};
  const image=nodes(component.ReviewImages({review})).find(e=>e.type==='SafeImage')!;
  assert.equal((image.props.source as {uri:string;cache:string}).uri,'https://api.example.test'+review.images[0]!.content_path);assert.equal((image.props.source as {cache:string}).cache,'reload');
  assert.equal(nodes(component.ReviewImages({review:{...review,status:'HIDDEN'}})).filter(e=>e.type==='SafeImage').length,0);
  assert.equal(nodes(component.ReviewImages({review:{...review,images:[{file_id:file,content_path:'https://untrusted.invalid/image'}]}})).filter(e=>e.type==='SafeImage').length,0);
});
test('App 案件命令锁定具体方案及案件版本，未知结果不换键重发',async()=>{
  const row={id,version:7,available_actions:['RESPOND'],offer:{id:'offer-2'}} as CaseDetail;
  const body=casePayload(row,'RESPOND',{accept:false}),calls:{path:string;body?:string;headers?:Record<string,string>}[] = [];
  const response={operation_result:{version:8},current_case:{...row,version:8,available_actions:[]}};
  const command=caseSubmission(async<T>(path:string,init?:{body?:string;headers?:Record<string,string>})=>{calls.push({path,...init});if(calls.length===1)throw Error('synthetic timeout');return response as T;},row,body,'stable-native-case-key');
  await assert.rejects(command());await command();assert.equal(calls[0]!.body,calls[1]!.body);assert.equal(calls[0]!.headers!['Idempotency-Key'],calls[1]!.headers!['Idempotency-Key']);
  assert.equal(JSON.parse(calls[0]!.body!).offer_id,'offer-2');assert.equal(JSON.parse(calls[0]!.body!).version,7);assert.equal(JSON.parse(calls[0]!.body!).accept,false);
});
