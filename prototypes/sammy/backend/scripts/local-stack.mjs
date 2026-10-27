import { spawn, spawnSync } from 'node:child_process';
import { socketDirectory } from './local-stack-config.mjs';
import { mkdtemp, mkdir, writeFile, readFile, cp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
const root=resolve(import.meta.dirname,'..'),pg=process.env.PGBIN??'/opt/homebrew/opt/postgresql@16/bin',local=resolve(root,'.local');
await mkdir(local,{recursive:true});
// Refuse before touching data or launching processes when an existing stack owns a port.
for(const port of [3100,9410,9411])await new Promise((yes,no)=>{const s=createServer();s.once('error',()=>no(new Error(`Port ${port} is in use. Stop the existing stack before restarting; its data is unchanged.`)));s.listen(port,'127.0.0.1',()=>s.close(yes));});
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const configPath=resolve(local,'stack.json');let config;
if(!process.argv.includes('--reset')){
 try{config=JSON.parse(await readFile(configPath,'utf8'));}catch{}
 if(!config){
  // Adopt the previously running temporary stack only after its PostgreSQL has stopped.
  let old={};try{old=Object.fromEntries((await readFile(resolve(local,'runtime.env'),'utf8')).split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));}catch{}
  if(old.DATABASE_URL){const oldDir=socketDirectory(old.DATABASE_URL);if(oldDir&&await exists(resolve(oldDir,'pg/PG_VERSION'))){if(spawnSync(`${pg}/pg_ctl`,['-D',resolve(oldDir,'pg'),'status'],{stdio:'ignore'}).status===0)throw new Error('Previous PostgreSQL is still running. Stop that stack before adopting its data.');const data=await mkdtemp(resolve(local,'data-'));await cp(resolve(oldDir,'pg'),resolve(data,'pg'),{recursive:true});if(await exists(resolve(oldDir,'objects')))await cp(resolve(oldDir,'objects'),resolve(data,'objects'),{recursive:true});config={dir:data,secret:old.S3_SECRET_ACCESS_KEY};console.log('Preserved previous local data in the persistent workspace directory. Original temporary files were retained.');}}
 }
}
if(!config){config={dir:await mkdtemp(resolve(local,'data-')),secret:randomBytes(24).toString('hex')};}
if(!config.secret)config.secret=randomBytes(24).toString('hex');
const dir=config.dir,socket=await mkdtemp(resolve(tmpdir(),'sammy-socket-')),children=[];let stopping=false,ownsPostgres=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');if(ownsPostgres)spawnSync(`${pg}/pg_ctl`,['-D',`${dir}/pg`,'-m','fast','stop'],{stdio:'ignore'});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop();process.exit(0);});process.on('exit',stop);
function command(exe,args,env=process.env){const r=spawnSync(exe,args,{cwd:root,env,stdio:'pipe'});if(r.status!==0)throw new Error(`${exe} failed: ${r.stderr?.toString()}`);}
try{
 if(!await exists(`${dir}/pg/PG_VERSION`))command(`${pg}/initdb`,['-D',`${dir}/pg`,'-A','trust','-U','sammy_local']);
 if(spawnSync(`${pg}/pg_ctl`,['-D',`${dir}/pg`,'status'],{stdio:'ignore'}).status===0)throw new Error('Selected PostgreSQL data is already in use. No process was stopped.');
 command(`${pg}/pg_ctl`,['-D',`${dir}/pg`,'-l',`${dir}/postgres.log`,'-o',`-k ${socket} -p 55487 -c listen_addresses=''`,'start']);ownsPostgres=true;
 const env={...process.env,DATABASE_URL:`postgresql://sammy_local@/postgres?host=${socket}&port=55487`,PORT:'3100',SAMMY_SIMULATED_PAYMENTS:'true',S3_ENDPOINT:'http://127.0.0.1:9410',S3_BUCKET:'sammy-local',S3_ACCESS_KEY_ID:'sammy-local',S3_SECRET_ACCESS_KEY:config.secret};
 const minio=spawn(resolve(root,'../../../.local/minio/bin/minio'),['server',`${dir}/objects`,'--address','127.0.0.1:9410','--console-address','127.0.0.1:9411'],{env:{...process.env,MINIO_ROOT_USER:env.S3_ACCESS_KEY_ID,MINIO_ROOT_PASSWORD:config.secret},stdio:'ignore'});children.push(minio);minio.on('error',error=>{console.error(error.message);stop();process.exit(1);});
 let healthy=false;for(let i=0;i<50;i++){try{if((await fetch(env.S3_ENDPOINT+'/minio/health/live')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!healthy)throw new Error('Local MinIO failed to start.');
 const storage=new S3Client({region:'auto',endpoint:env.S3_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:env.S3_ACCESS_KEY_ID,secretAccessKey:config.secret}});try{await storage.send(new CreateBucketCommand({Bucket:env.S3_BUCKET}));}catch(e){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name))throw e;}finally{storage.destroy();}
 command(process.execPath,['--import','tsx','scripts/migrate.ts'],env);
 await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 await writeFile(resolve(local,'runtime.env'),Object.entries(env).filter(([k])=>['DATABASE_URL','PORT','SAMMY_SIMULATED_PAYMENTS','S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'].includes(k)).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});
 const api=spawn(process.execPath,['--import','tsx','src/local.ts'],{cwd:root,env,stdio:'inherit'});children.push(api);api.on('exit',code=>{stop();process.exit(code??1);});
 console.log('Persistent Sammy API: http://127.0.0.1:3100 · admin: /admin. Ctrl-C safely stops the stack; restart reuses data. --reset selects a fresh database and retains the previous data directory.');
}catch(error){stop();throw error;}
