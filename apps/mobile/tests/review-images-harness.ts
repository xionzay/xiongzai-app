import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as contracts from '@xiongzai/contracts/after-sale-client';
const require=createRequire(import.meta.url);
/** Compile the actual component; only native primitives, query and upload boundaries are substituted. */
export function reviewImagesHarness(maximum=30) {
  const exports={} as {ReviewImages:(props:unknown)=>unknown;ReviewImagesPicker:(props:unknown)=>unknown};
  const code=ts.transpileModule(readFileSync(new URL('../src/features/after-sale/review-images.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require(name:string){
    if(name==='react/jsx-runtime')return require(name);
    if(name==='react')return {useState:(value:unknown)=>[value,()=>{}]};
    if(name==='@tanstack/react-query')return {useQuery:()=>({data:[{file_type:'REVIEW_IMAGE',maximum_count:maximum}]})};
    if(name==='react-native')return {View:'View',Text:'Text'};
    if(name==='@xiongzai/contracts/after-sale-client')return contracts;
    if(name==='@/auth/runtime')return {apiClient:{reviewContentUrl:(path:string)=>'https://api.example.test'+path}};
    if(name==='@/components/safe-image')return {SafeImage:'SafeImage'};
    if(name==='@/components/primary-button')return {PrimaryButton:'PrimaryButton'};
    if(name==='@/features/files/image-upload-slot')return {ImageUploadSlot:'ImageUploadSlot'};
    if(name==='@/features/files/file-upload-api')return {listFilePolicies:async()=>[]};
    throw new Error('Unexpected review dependency '+name);
  }});
  return exports;
}
