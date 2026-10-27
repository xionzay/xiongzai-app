// Run with node --import tsx --env-file=.env.local scripts/import-local-data.mjs <snapshot> --apply.
// Existing records are never overwritten. Source snapshots remain private and intact.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { hashPassword } from '../src/auth.ts';
import { credentials, draftSchema } from '../src/validation.ts';
import { demoServices } from '../../mobile/src/screens/demo-services.ts';
import { en } from '../../mobile/src/i18n/en.ts';
import { zh } from '../../mobile/src/i18n/zh.ts';

const sourcePath=process.argv[2];
if(!sourcePath||!process.env.DATABASE_URL)throw new Error('A device snapshot path and DATABASE_URL are required.');
const profileSchema=z.object({phone:credentials.shape.phone,nickname:z.string().min(2).max(24),bio:z.string().max(160),providerDraft:z.record(z.string(),z.unknown()).optional()}).passthrough();
const source=z.object({version:z.literal(1),accounts:z.array(profileSchema),profile:profileSchema.nullable(),orders:z.array(z.unknown()),conversations:z.array(z.unknown())}).passthrough().parse(JSON.parse(await readFile(sourcePath,'utf8')));
const accounts=new Map(source.accounts.map(a=>[a.phone,a]));
if(source.profile)accounts.set(source.profile.phone,source.profile);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=key=>{const bytes=createHash('sha256').update('sammy-local-import-v1:'+key).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;};
const plans=[
 {key:'device-v1',snapshot:source,users:[...accounts.values()].map(a=>({id:id('phone:'+a.phone),phone:a.phone,nickname:a.nickname,bio:a.bio,draft:null})),listings:[]},
 {key:'demo-services-v1',snapshot:{services:demoServices,text:Object.fromEntries(demoServices.flatMap(s=>[s.title,s.description]).map(key=>[key,{en:en[key],zh:zh[key]}]))},users:demoServices.map(s=>({id:id('demo:'+s.id),phone:'demo:provider:'+s.id,nickname:s.name,bio:'Demo sample / 示例陪玩',draft:null})),listings:demoServices.flatMap(s=>['duo','squad'].map(mode=>({id:id('listing:'+s.id+':'+mode),ownerId:id('demo:'+s.id),title:zh[s.title]+' / '+en[s.title],description:zh[s.description]+'\n'+en[s.description],mode,category:s.category,priceFen:s.pricesFen[mode]})))},
];
// Strip device-only voiceIntroduction before validating the hosted draft.
for(const user of plans[0].users){const original=accounts.get(user.phone)?.providerDraft;if(original){const {voiceIntroduction,...fields}=original;const d=draftSchema.safeParse({...fields,voiceMediaId:null});user.draft=d.success?d.data:null;}}
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
const client=await pool.connect();
try{
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(19731024)');
 let insertedUsers=0,insertedListings=0;
 const credentialsPath=new URL('../.local/imports/account-passwords.json',import.meta.url);
 let passwords={};
 try{passwords=JSON.parse(await readFile(credentialsPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const plan of plans){
  const previous=await client.query('SELECT source_hash FROM local_data_imports WHERE id=$1',[plan.key]);
  if(previous.rowCount){if(previous.rows[0].source_hash!==hash(plan.snapshot))throw new Error('Source changed since import: '+plan.key+'. Existing data was preserved; review a new migration instead.');console.log('Already imported:',plan.key);continue;}
  if(!process.argv.includes('--apply')){console.log('Planned:',plan.key,plan.users.length,'accounts,',plan.listings.length,'draft services');continue;}
  for(const user of plan.users){
   const clash=await client.query('SELECT id FROM users WHERE id=$1 OR phone=$2',[user.id,user.phone]);
   if(clash.rowCount)throw new Error('An account already exists outside this import; refusing to merge identities.');
   const password=randomBytes(24).toString('base64url');
   if(!user.phone.startsWith('demo:')){
    passwords[user.phone]={id:user.id,password};
    await mkdir(new URL('../.local/imports/',import.meta.url),{recursive:true});
    // Exclusive permissions, saved before COMMIT so a crash cannot lose the generated password.
    await writeFile(credentialsPath,JSON.stringify(passwords,null,2),{mode:0o600});
   }
   await client.query('INSERT INTO users(id,phone,password_hash,nickname,bio,draft) VALUES($1,$2,$3,$4,$5,$6)',[user.id,user.phone,await hashPassword(password),user.nickname,user.bio,user.draft]);insertedUsers++;
  }
  for(const l of plan.listings){await client.query("INSERT INTO listings(id,owner_id,title,description,game,mode,category,price_fen,status) VALUES($1,$2,$3,$4,'peaceElite',$5,$6,$7,'draft')",[l.id,l.ownerId,l.title,l.description,l.mode,l.category,l.priceFen]);insertedListings++;}
  await client.query('INSERT INTO local_data_imports(id,source_hash,snapshot,record_ids) VALUES($1,$2,$3,$4)',[plan.key,hash(plan.snapshot),plan.snapshot,{users:plan.users.map(u=>u.id),listings:plan.listings.map(l=>l.id)}]);
 }
 await client.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({applied:process.argv.includes('--apply'),insertedUsers,insertedListings,archivedOrders:source.orders.length,archivedConversations:source.conversations.length}));
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
