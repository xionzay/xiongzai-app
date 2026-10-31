import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { allowedUserActions, caseError, casePayload, caseStates, caseSubmission, centDisplay, userCaseActions, type CaseDetail, type CaseForm, type UserCaseAction } from '@xiongzai/contracts/after-sale-client';
import { apiClient } from '@/auth/runtime';
import { NativePage } from '@/components/native-page';
import { FormField } from '@/components/form-field';
import { NoticeBanner } from '@/components/notice-banner';
import { PrimaryButton } from '@/components/primary-button';
import { useAfterSaleCase, useAfterSaleCases, useCaseHistory } from './case-api';
import { queryClient } from '@/query/query-client';
import { ImageUploadSlot } from '@/features/files/image-upload-slot';
import { FulfillmentEvidence, FulfillmentEvidencePicker } from '@/features/checkout/fulfillment-evidence';
import { useOrderDetail } from '@/features/checkout/order-api';
import { CaseEvidence } from './case-evidence';
const date=(value?:string|null)=>value?new Date(value).toLocaleString('zh-CN'):'无当前截止时间';

export function CaseList({onOpen}:{onOpen:(id:string)=>void}) {
  const query=useAfterSaleCases();
  return <View><Text>我的售后案件（买卖双方）</Text>{query.isError&&<NoticeBanner message="案件列表读取失败，请重试。" />}<PrimaryButton tone="plain" label="刷新案件列表" disabled={query.isFetching} onPress={()=>void query.refetch()} />{query.data?.pages.flatMap(page=>page.items).map(row=><PrimaryButton key={row.id} tone="plain" label={`${caseStates[row.state]} · ${row.id.slice(-8)}`} onPress={()=>onOpen(row.id)} />)}{query.hasNextPage&&<PrimaryButton tone="plain" label="加载更多案件" disabled={query.isFetching} onPress={()=>void query.fetchNextPage()} />}</View>;
}
export function CaseScreen({id}:{id:string}) {
  const query=useAfterSaleCase(id),history=useCaseHistory(id),order=useOrderDetail(query.data?.order_id??'',!!query.data?.order_id);
  const [action,setAction]=useState<UserCaseAction|null>(null),[form,setForm]=useState<CaseForm>({}),[ids,setIds]=useState<string[]>([]),[ready,setReady]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[prepared,setPrepared]=useState(false);
  const [snapshot,setSnapshot]=useState<CaseDetail|null>(null),[attempted,setAttempted]=useState(false);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const write=useRef<ReturnType<typeof caseSubmission>|null>(null),lock=useRef(false);
  const evidenceChange=useCallback((files:string[],valid:boolean)=>{setIds(files);setReady(valid);},[]);
  const row=query.data;
  const refresh=async()=>{await Promise.all([query.refetch(),history.refetch(),order.refetch()]);};
  const choose=(next:UserCaseAction)=>{if(write.current||lock.current)return;setAction(next);setForm({});setIds([]);setReady(false);setNotice('');};
  const prepare=()=>{
    if(!row||!action||write.current)return;
    try{if(action==='SUBMIT_REMEDY'&&!ready)throw new Error('请满足至少五图及实付200元录屏门槛，并完成文件人工审核。');const payload=casePayload(row,action,{...form,fileIds:ids});write.current=caseSubmission((path,init)=>apiClient.request(path,init),row,payload,Crypto.randomUUID());setSnapshot(row);setAttempted(false);setPrepared(true);setNotice('请核对案件、方案及裁决版本，再确认提交。');}catch(error){setNotice(error instanceof Error?error.message:'请核对输入。');}
  };
  const submit=async()=>{
    if(!write.current||lock.current)return;lock.current=true;setBusy(true);setAttempted(true);
    try{const result=await write.current();if(!mounted.current)return;queryClient.setQueryData(['after-sale-case',id],result.current_case);write.current=null;setPrepared(false);setAction(null);setNotice('服务端已确认本次操作；申请或裁决不等于退款到账。');await Promise.all([history.refetch(),order.refetch(),...['buyer-orders','seller-orders','seller-refunds','my-refunds','after-sale-cases','refund','seller-refund'].map(key=>queryClient.invalidateQueries({queryKey:[key]}))]);}
    catch(error){if(!mounted.current)return;if(error&&typeof error==='object'&&'status'in error&&error.status===409){write.current=null;setPrepared(false);setAction(null);await refresh();}setNotice(caseError(error));}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  const field=(key:keyof CaseForm,label:string,numeric=false)=><FormField key={key} label={label} value={String(form[key]??'')} onChangeText={value=>setForm(old=>({...old,[key]:value}))} editable={!busy&&!prepared} keyboardType={numeric?'number-pad':'default'} maxLength={1000} />;
  const remedy=action==='SUBMIT_REMEDY'||action==='APPEND_REMEDY';
  const needsEvidence=action&&['REJECT','ADD_EVIDENCE','APPEAL'].includes(action);
  return <NativePage title="售后案件" subtitle="实际退款、案件与订单状态分别展示" contentStyle={{gap:12}}>
    <PrimaryButton tone="plain" label="重新读取案件" disabled={busy} onPress={()=>void refresh()} />{notice&&<NoticeBanner message={notice} />}{query.isError&&<NoticeBanner tone="danger" message="案件读取失败，不能提交旧版本。" />}
    {row&&!query.isError?<><Text>{caseStates[row.state]??'未知案件状态'}</Text><Text>案件版本 {row.version} · 申请 ¥{centDisplay(row.requested_amount_cent)} · 截止 {date(row.deadline_at)}</Text><Text>已修改 {row.modifications}/2 次 · 介入前协商 {row.negotiation_rounds}/2 轮。补充履约继续原案；延期与正常履约共用每单一次。</Text>
      {row.funding&&<View><Text>专项保全 ¥{centDisplay(row.funding.held_cent)}</Text><Text>平台留存佣金 ¥{centDisplay(row.funding.commission_reserved_cent)}</Text><Text>资金缺口 ¥{centDisplay(row.funding.funding_gap_cent)}</Text><Text>不足时整笔待执行，足额后才发原渠道退款；不拆分、不自动垫付。</Text></View>}
      {row.offer&&<View><Text>方案 {row.offer.id} · 到期 {date(row.offer.expires_at)}</Text>{row.offer.kind==='REFUND'?<><Text>退款 ¥{centDisplay(row.offer.amount_cent??'')} · 保留成交 ¥{centDisplay(row.offer.retained_amount_cent??'')}</Text><Text>已认可交付/成本：{row.offer.recognized_delivery}</Text><Text>剩余未交付义务终止：{row.offer.remaining_obligations_terminated?'是':'未确认'}</Text></>:<><Text>补充履约：{row.offer.content} · 数量 {row.offer.quantity}</Text><Text>验收标准 {row.offer.standard} · 期限 {row.offer.fulfillment_seconds} 秒</Text></>}<Text>沉默不是接受，必须明确回应当前方案。</Text></View>}
      {row.decision&&<View><Text>裁决 {row.decision.id} · 第 {row.decision.level} 级 · 截止 {date(row.decision.appeal_deadline_at)}</Text><Text>{row.decision.outcome==='REFUND'?'支持退款':'不支持退款'} ¥{centDisplay(row.decision.amount_cent)}</Text>{(['facts','rule_basis','liability','reason','remaining_obligations','execution_conditions'] as const).map((key,i)=><Text key={key}>{['事实','依据','责任','理由','剩余义务','执行条件'][i]}：{row.decision![key]}</Text>)}<Text>已记录 {row.accepted_by?.length??0} 方接受；单方接受不能提前执行，有效申诉阻止旧裁决执行。</Text></View>}
      <CaseEvidence caseId={row.id} ids={row.evidence_file_ids} />{row.remedy_evidence_file_ids?.length&&order.data?<View><Text>本案补充履约凭证（单独验收，不解除冻结）</Text><FulfillmentEvidence orderId={row.order_id} files={(order.data.fulfillment_evidence??[]).filter(file=>row.remedy_evidence_file_ids?.includes(file.file_id))} /></View>:null}
      {allowedUserActions(row).map(key=><PrimaryButton key={key} tone="plain" label={userCaseActions[key]} disabled={busy||prepared} onPress={()=>choose(key)} />)}
      {action&&<View style={{gap:10}}><Text>{userCaseActions[action]} · 核对案件版本 {prepared?snapshot?.version:row.version}{prepared? ` / 方案 ${snapshot?.offer?.id??"无"} / 裁决 ${snapshot?.decision?.id??"无"}`:""}</Text>
        {['MODIFY','WITHDRAW','APPROVE','REJECT','ESCALATE','APPEAL'].includes(action)&&field('reason','操作说明')}
        {action==='MODIFY'&&<>{field('amount','申请金额（整数分）',true)}<Text>D06：临时复用 SERVICE_ISSUE，正式启用前确认。</Text></>}
        {action==='OFFER'&&<><PrimaryButton tone="plain" label={form.kind==='REMEDY'?'当前：补充履约；切换退款方案':'当前：退款方案；切换补充履约'} disabled={prepared} onPress={()=>setForm(old=>({...old,kind:old.kind==='REMEDY'?'REFUND':'REMEDY'}))} />{form.kind==='REMEDY'?<>{field('content','补充履约内容')}{field('quantity','数量')}{field('standard','验收标准')}{field('seconds','接受后期限（秒，最多604800）',true)}</>:<>{field('amount','退款金额（整数分）',true)}{field('retained','保留成交金额（整数分）',true)}{field('delivery','已认可交付与实际成本')}<PrimaryButton tone="plain" label={form.terminated?'已确认剩余义务终止；取消确认':'明确确认剩余未交付义务终止'} disabled={prepared} onPress={()=>setForm(old=>({...old,terminated:!old.terminated}))} /></>}</>}
        {action==='RESPOND'&&<><Text>当前选择：{form.accept===undefined?'未选择':form.accept?'接受':'拒绝'}</Text><PrimaryButton tone="plain" label="明确接受当前方案" disabled={prepared} onPress={()=>setForm(old=>({...old,accept:true}))} /><PrimaryButton tone="plain" label="明确拒绝当前方案" disabled={prepared} onPress={()=>setForm(old=>({...old,accept:false}))} /></>}
        {needsEvidence&&!prepared&&<><ImageUploadSlot selectionOnly fileType="COMPLAINT_EVIDENCE" label="案件证据" expectedVisibility="PRIVATE" onReady={async file=>{setIds(old=>old.includes(file.id)?old:[...old,file.id]);}} />{ids.map(fileId=><PrimaryButton key={fileId} tone="plain" label={`移除本次选择 ${fileId.slice(-8)}`} onPress={()=>setIds(old=>old.filter(x=>x!==fileId))} />)}<Text>本地证据临时限制30份；文件人工审核不等于已向对方开放。</Text></>}
        {remedy&&!prepared&&(order.data?<FulfillmentEvidencePicker paidCent={order.data.paid_amount_cent} onChange={evidenceChange} />:<Text>正在读取实付金额，读取成功前不可提交。</Text>)}
        {action==='CONFIRM_REMEDY'&&<Text>确认将接受补充履约并结原案结算；不会通过普通确认绕过冻结。</Text>}
        {action==='EXTEND_REMEDY'&&<Text>使用本订单唯一一次24小时延期，不能与正常履约重复领取。</Text>}
        {action==='ACCEPT_DECISION'&&<Text>只接受上方具体裁决版本，单方接受不提前执行。</Text>}
        {!prepared?<PrimaryButton label="核对并准备提交" onPress={prepare} />:<><Text>结果未知只可原键原内容重试；可先读取服务端核对。</Text><PrimaryButton label="确认提交案件操作" loading={busy} disabled={busy} onPress={()=>void submit()} /></>}
        <PrimaryButton tone="plain" label="取消未提交操作" disabled={busy||attempted} onPress={()=>{write.current=null;setPrepared(false);setSnapshot(null);setAction(null);}} />
      </View>}
      <CaseList onOpen={caseId=>router.replace({pathname:"/refunds/[id]",params:{id:caseId}})} />
      <Text>案件历史</Text>{history.data?.pages.flatMap(page=>page.items).map(item=><Text key={item.version}>版本 {item.version} · {userCaseActions[item.action as UserCaseAction]??item.action} · {date(item.created_at)} · {caseStates[item.data.to??'']??''}</Text>)}{history.isError&&<NoticeBanner message="历史读取失败，请重新读取。" />}{history.hasNextPage&&<PrimaryButton tone="plain" label="加载更多案件历史" disabled={history.isFetching} onPress={()=>void history.fetchNextPage()} />}
      <PrimaryButton tone="plain" label="联系平台客服（特殊受理须客服核验）" onPress={()=>router.push({pathname:'/support/new',params:{relatedType:'REFUND',relatedId:row.id}})} />
    </>:<Text>正在读取实际案件…</Text>}
  </NativePage>;
}
