'use client';
import { useEffect, useState } from 'react';
import { reviewImagePath, type ReviewImage } from '../packages/contracts/src/after-sale-client';
import { ConnectedFiles } from './ConnectedFiles';
import type { BusinessFile, Request } from './connected-commerce';
import { apiBaseUrl } from './user-api-location';

export function ConnectedReviewImagesPicker({ request, selected, onChange }: { request: Request; selected: BusinessFile[]; onChange: (files: BusinessFile[]) => void }) {
  const [maximum, setMaximum] = useState<number | null>(null), [notice, setNotice] = useState('');
  useEffect(() => { const c=new AbortController(); void request<Array<{file_type:string;maximum_count?:number}>>('/files/policies',{signal:c.signal}).then(rows=>{const value=rows.find(row=>row.file_type==='REVIEW_IMAGE')?.maximum_count;if(!c.signal.aborted&&value&&Number.isSafeInteger(value))setMaximum(value);}).catch(()=>{if(!c.signal.aborted)setNotice('评价图片策略读取失败，请刷新页面。');});return()=>c.abort();},[request]);
  return <section><p>评价图片选填。{maximum ? `最多 ${maximum} 张；` : '正在读取上传策略；'}临时测试配置，正式启用前确认。只有已校验、人工审核通过的本人图片可选，提交评价后才绑定。</p>{maximum && <ConnectedFiles request={request} purpose="REVIEW_IMAGE" label="评价图片" selected={selected} onChange={files=>{if(files.length>maximum){setNotice(`最多选择 ${maximum} 张图片。`);return;}setNotice('');onChange(files);}} />}<p role="status">{notice}</p></section>;
}
export function ConnectedReviewImages({ review }: { review: { id:string;status?:string;images?:ReviewImage[];refund_label?:string|null } }) {
  return <section aria-label="评价图片">{review.refund_label==='FULLY_REFUNDED'&&<p>已退款（服务端确认全额退款）</p>}{(!review.status || review.status==='PUBLIC') && review.images?.map(image=>{const path=reviewImagePath(review.id,image);return path?<ReviewImageView key={`${review.id}:${image.file_id}`} path={path} />:null;})}</section>;
}
function ReviewImageView({path}:{path:string}) {
  const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  return failed?<p>图片已隐藏、删除或暂不可访问。<button type="button" onClick={()=>{setRetry(n=>n+1);setFailed(false);}}>重新校验图片访问</button></p>:<img key={retry} src={`${apiBaseUrl()}${path.slice('/api/v1'.length)}?view=${retry}`} alt="用户评价图片" loading="lazy" referrerPolicy="no-referrer" style={{maxWidth:'100%',maxHeight:240,objectFit:'contain'}} onError={()=>setFailed(true)} />;
}
