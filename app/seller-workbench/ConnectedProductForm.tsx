'use client';
import {useState} from 'react';
import {ProductForm,ProductConfirm,SpecEditor} from './ProductEditor';
import {withSpecIds} from './product-editor-model';
import type {MerchantProduct} from './model';
/** The formal product API currently has no game/gallery/completion-hours contract. Do not silently drop those fields. */
export function ConnectedProductForm({initial,back}:{initial?:MerchantProduct;back:()=>void}){
 const [draft,setDraft]=useState<MerchantProduct>(()=>withSpecIds(initial??{id:crypto.randomUUID(),title:'',description:'',cover:'',category:'和平精英',status:'草稿',dimensions:[],variants:[],hours:'',requirements:'',notice:'',updated:Date.now()}));
 const [busy,setBusy]=useState(false),[specs,setSpecs]=useState<MerchantProduct|null>(null),[changed,setChanged]=useState(false),[leaving,setLeaving]=useState(false);
 const patch=(p:Partial<MerchantProduct>)=>{setDraft(d=>({...d,...p}));setChanged(true)};
 return <div className="app-screen seller-workbench sw-product-focus"><header className="sw-header"><button aria-label="返回商品管理" onClick={()=>changed?setLeaving(true):back()}>返回</button><h1>{specs?'规格与价格':initial?'编辑商品':'发布商品'}</h1></header><p className="decision-info" role="status">新版商品保存接口尚缺游戏、多图、详情图和完成时限字段。可以检查表单，暂不能保存或提交审核；所选图片只在当前页面预览，不会上传。</p>{specs?<SpecEditor draft={specs} patch={p=>setSpecs(d=>d?{...d,...p}:d)} confirm={()=>{patch(specs);setSpecs(null)}}/>:<><ProductForm draft={draft} patch={patch} errors={{}} openSpecs={()=>setSpecs(structuredClone(draft))} busy={busy} setBusy={setBusy}/><div className="sw-sticky-actions"><button disabled>保存草稿</button><button disabled className="sw-primary">提交审核</button></div></>}{leaving&&<ProductConfirm title="放弃未保存的填写？" description="当前内容尚未保存到服务器，离开将丢失本次填写。" onCancel={()=>setLeaving(false)} onConfirm={back}/>}</div>;
}
