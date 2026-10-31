import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/auth-provider';
import { apiClient } from '@/auth/runtime';
import { PrimaryButton } from '@/components/primary-button';
import { trustedEvidenceUrl } from '@/features/checkout/evidence-access';
export function CaseEvidence({caseId,ids}:{caseId:string;ids:string[]}) {
  const {status}=useAuth(); const [url,setUrl]=useState<string|null>(null),[notice,setNotice]=useState('');
  const generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),controller=useRef<AbortController|null>(null);
  const clear=useCallback(()=>{generation.current++;controller.current?.abort();if(timer.current)clearTimeout(timer.current);setUrl(null);},[]);
  useFocusEffect(useCallback(()=>()=>clear(),[clear]));
  useEffect(()=>{const sub=AppState.addEventListener('change',next=>{if(next!=='active')clear();});return()=>{sub.remove();clear();};},[clear,caseId]);
  useEffect(()=>{let active=true; if(status!=='authenticated')void Promise.resolve().then(()=>{if(active)clear();});return()=>{active=false;};},[clear,status]);
  const open=useCallback(async(id:string)=>{
    clear();const g=generation.current,c=new AbortController();controller.current=c;
    try{const result=await apiClient.request<{file_id:string;access:{url:string;expires_at:string}}>(`/files/after-sale-evidence/${caseId}/${id}/access`,{signal:c.signal});if(g!==generation.current)return;const ttl=Date.parse(result.access.expires_at)-Date.now();if(result.file_id!==id||!Number.isFinite(ttl)||ttl<=0)throw new Error();setUrl(trustedEvidenceUrl(result.access.url));setNotice('仅本次短时访问；未经隐私确认的对方原件不可访问。');timer.current=setTimeout(clear,Math.min(ttl,60000));}catch{if(g===generation.current)setNotice('材料未对你开放、已失效或读取失败。');}
  },[clear,caseId]);
  return <View><Text>案件证据</Text>{ids.map((id,i)=><PrimaryButton key={id} tone="plain" label={`查看案件证据 ${i+1}`} disabled={status!=='authenticated'} onPress={()=>void open(id)} />)}{url&&status==='authenticated'&&<Image source={{uri:url,cache:'reload'}} style={{width:'100%',aspectRatio:1}} resizeMode="contain" accessibilityLabel="本次授权的案件证据" onError={()=>{clear();setNotice('材料无法预览，请重新取得访问权限或联系客服。');}} />}<Text>{notice}</Text>{url&&<PrimaryButton tone="plain" label="关闭材料预览" onPress={clear} />}</View>;
}
