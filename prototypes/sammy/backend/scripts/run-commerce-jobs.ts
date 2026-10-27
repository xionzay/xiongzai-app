import { createDatabase } from '../src/db.js';
import { runDueCommerceJobs } from '../src/commerce-core.js';
import { simulationAvailable } from '../src/orders.js';
if(!simulationAvailable())throw new Error('Commerce simulation worker is disabled.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
const {db,pool}=createDatabase(process.env.DATABASE_URL);
try{console.log(await runDueCommerceJobs(db));}finally{await pool.end();}
