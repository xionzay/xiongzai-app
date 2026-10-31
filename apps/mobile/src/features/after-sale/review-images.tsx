import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { reviewImagePath, type ReviewImage } from '@xiongzai/contracts/after-sale-client';
import { apiClient } from '@/auth/runtime';
import { SafeImage } from '@/components/safe-image';
import { PrimaryButton } from '@/components/primary-button';
import { ImageUploadSlot } from '@/features/files/image-upload-slot';
import { listFilePolicies } from '@/features/files/file-upload-api';
export function ReviewImagesPicker({ids,onChange}:{ids:string[];onChange:(ids:string[])=>void}) {
  const policy=useQuery({queryKey:['file-policies'],queryFn:({signal})=>listFilePolicies(signal)});
  const maximum=policy.data?.find(row=>row.file_type==='REVIEW_IMAGE')?.maximum_count;
  const [notice,setNotice]=useState('');
  return <View><Text>选填评价图片。D09/D13 临时测试配置，正式启用前确认。{maximum?`最多${maximum}张；`:'策略尚未读取；'}只可选本人已校验且人工审核通过的图片，发布后才绑定。</Text>{maximum&&<ImageUploadSlot selectionOnly fileType="REVIEW_IMAGE" label="评价图片" expectedVisibility="PRIVATE" onReady={async file=>{if(ids.includes(file.id))return;if(ids.length>=maximum){setNotice(`最多${maximum}张，请先移除本次选择。`);throw new Error('selection_limit');}setNotice('');onChange([...ids,file.id]);}} />}{ids.map(id=><PrimaryButton key={id} tone="plain" label={`移除本次选择 ${id.slice(-8)}`} onPress={()=>onChange(ids.filter(item=>item!==id))} />)}{notice&&<Text>{notice}</Text>}{policy.isError&&<PrimaryButton tone="plain" label="重试读取评价图片限制" onPress={()=>void policy.refetch()} />}</View>;
}
export function ReviewImages({review}:{review:{id:string;status?:string;refund_label?:string|null;images?:ReviewImage[]}}) {
  return <View>{review.refund_label==='FULLY_REFUNDED'&&<Text>已退款（服务端实际全额退款）</Text>}{(!review.status||review.status==='PUBLIC')&&review.images?.map(image=>{const path=reviewImagePath(review.id,image);return path?<SafeImage key={image.file_id} source={{uri:apiClient.reviewContentUrl(path),cache:'reload'}} style={{width:'100%',aspectRatio:1}} label="用户评价图片（隐藏或删除后不可访问）" resizeMode="contain" />:null;})}</View>;
}
