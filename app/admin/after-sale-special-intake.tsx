'use client';
import { useRef, useState } from 'react';
import { adminApiRequest, adminFailure } from './admin-api';
import type { CaseDetail } from './after-sale-case-data';

/** Explicit human intake only: never infers eligibility from a closed order or a file approval. */
export function AfterSaleSpecialIntake({onCreated}:{onCreated:(row:CaseDetail)=>Promise<void>}) {
  const [form,setForm]=useState({order_id:'',amount_cent:'',reason_code:'SERVICE_ISSUE',reason_text:'',first_platform_contact_at:'',evidence:''}),[verified,setVerified]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const pending=useRef<{body:string;key:string}|null>(null),lock=useRef(false);
  const prepare=()=>{
    const ids=form.evidence.split(/[\s,，]+/u).filter(Boolean),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
    if(!verified||!uuid.test(form.order_id)||!/^\d{1,19}$/u.test(form.amount_cent)||BigInt(form.amount_cent)<=0n||form.reason_text.trim().length<2||!ids.length||ids.length>30||ids.some(id=>!uuid.test(id))||new Set(ids).size!==ids.length||!form.first_platform_contact_at){setNotice('请完整填写订单、整数分金额、原因、首次联系时间和证据，并人工核验严重问题。');return;}
    const at=new Date(form.first_platform_contact_at);if(!Number.isFinite(at.getTime())){setNotice('首次联系时间无效。');return;}
    const {evidence:_,...fields}=form;void _;
    pending.current={body:JSON.stringify({...fields,first_platform_contact_at:at.toISOString(),contact_evidence_file_ids:ids,serious_issue_verified:true}),key:crypto.randomUUID()};setConfirm(true);setNotice('请再次核对首次交易终结后七天内明确联系平台的时间和材料；后端仍会执行资格与归属校验。');
  };
  const submit=async()=>{
    if(!pending.current||lock.current)return;lock.current=true;setBusy(true);
    try{const row=await adminApiRequest<CaseDetail>('/after-sale/cases/special',{method:'POST',headers:{'Idempotency-Key':pending.current.key},body:pending.current.body});if(!row?.id||row.case_type!=='SPECIAL'||!Number.isSafeInteger(row.version))throw new Error('invalid_response');pending.current=null;setConfirm(false);setVerified(false);setNotice('特殊案件已受理；不代表支持退款或渠道到账。');try{await onCreated(row);}catch{setNotice('特殊案件已受理，但列表刷新失败；请刷新案件列表，不要重复受理。');}}
    catch(error){const failure=adminFailure(error);setNotice(failure.message);if(error&&typeof error==='object'&&'status'in error&&Number(error.status)>=400&&Number(error.status)<500&&![408,429].includes(Number(error.status))){pending.current=null;setConfirm(false);}}
    finally{lock.current=false;setBusy(false);}
  };
  return <details><summary>客服人工特殊受理</summary><p>仅处理首次交易终结后的严重问题。原评价期限不重开；资金不足整笔待执行，不垫付、不拆分。</p>{([['order_id','订单 ID'],['amount_cent','申请金额（整数分）'],['reason_text','受理原因'],['first_platform_contact_at','首次明确联系平台时间（本机时区）'],['evidence','申请买家本人已审核 COMPLAINT_EVIDENCE 文件 ID（逗号分隔）']] as const).map(([key,label])=><label key={key}>{label}<input type={key==='first_platform_contact_at'?'datetime-local':'text'} disabled={busy||confirm} value={form[key]} maxLength={key==='evidence'?1200:1000} onChange={event=>setForm(old=>({...old,[key]:event.target.value}))} /></label>)}<label><input type="checkbox" disabled={busy||confirm} checked={verified} onChange={event=>setVerified(event.target.checked)} />已人工核验严重问题及首次联系证据（不默认确认）</label><p>D06 临时原因配置，正式启用前确认。</p><p role="status">{notice}</p>{confirm?<button type="button" disabled={busy} onClick={()=>void submit()}>{busy?'提交中…':'确认特殊受理（原键安全重试）'}</button>:<button type="button" onClick={prepare}>核对特殊受理</button>}</details>;
}
