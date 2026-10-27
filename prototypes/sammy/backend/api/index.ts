import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDatabase } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { ObjectStorage } from '../src/storage.js';
let ready:ReturnType<typeof initialize>|undefined;
async function initialize(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
 const {db}=createDatabase(process.env.DATABASE_URL);
 const app=buildApp({db,storage:ObjectStorage.fromEnvironment()});await app.ready();return app;
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
 try{const app=await(ready??=initialize().catch(error=>{ready=undefined;throw error;}));app.server.emit('request',req,res);}
 catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'serviceUnavailable'}));}
}
