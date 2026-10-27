import { readFile } from 'node:fs/promises';
import { createDatabase } from '../src/db.js';
const url=process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if(!url) throw new Error('DATABASE_URL is required.');
const {pool}=createDatabase(url);
const client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(19731018)');
 await client.query('CREATE TABLE IF NOT EXISTS sammy_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of ['0001','0002','0003','0004','0005','0006']){
 const found=await client.query('SELECT name FROM sammy_migrations WHERE name=$1',[name]);
 if(!found.rowCount){await client.query(await readFile(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));await client.query('INSERT INTO sammy_migrations(name) VALUES($1)',[name]);}
 }
 await client.query('COMMIT');console.log('Sammy database migration complete.');
} catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
