import { eq } from 'drizzle-orm';
import { createDatabase } from '../src/db.js';
import { users } from '../src/schema.js';
import { phone } from '../src/validation.js';
const number=phone.parse(process.argv[2]);
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const {db,pool}=createDatabase(process.env.DATABASE_URL);
try{const result=await db.update(users).set({isAdmin:true,...(process.argv.includes('--supervisor')?{isSupervisor:true}:{})}).where(eq(users.phone,number)).returning({id:users.id});if(!result.length)throw new Error('Register this account first.');console.log('Admin role granted to the specified existing account.');}finally{await pool.end();}
