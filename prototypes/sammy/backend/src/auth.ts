import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, sql } from 'drizzle-orm';
import { sessions, users } from './schema.js';
import type { Database } from './db.js';
import { ApiError } from './validation.js';
const scrypt=promisify(scryptCallback);
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return `scrypt:${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password:string,hash?:string){
 const [,salt,hex]=hash?.split(':')??['scrypt','missing-account-salt','00'.repeat(64)];
 const key=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(hex,'hex');
 return !!hash&&key.length===expected.length&&timingSafeEqual(key,expected);
}
export async function createSession(db:Database,userId:string){
 const token=randomBytes(32).toString('base64url');
 await db.insert(sessions).values({tokenHash:digest(token),userId,expiresAt:new Date(Date.now()+7*24*3600_000)});
 return token;
}
export async function authenticate(db:Database,authorization?:string,{allowRestricted=false}:{allowRestricted?:boolean}={}){
 const token=authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 if(!token) throw new ApiError(401,'authenticationRequired');
 const result=await db.select({user:users}).from(sessions).innerJoin(users,eq(users.id,sessions.userId)).where(and(eq(sessions.tokenHash,digest(token)),gt(sessions.expiresAt,new Date())));
 if(!result[0]) throw new ApiError(401,'sessionExpired');
 if(result[0].user.suspended&&(!allowRestricted||result[0].user.isAdmin))throw new ApiError(403,'accountSuspended');
 return result[0].user;
}
export async function limit(db:Database,key:string,maximum:number){
 const result=await db.execute(sql`INSERT INTO rate_limits(key,count,expires_at) VALUES(${digest(key)},1,now()+interval '10 minutes')
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,
 expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '10 minutes' ELSE rate_limits.expires_at END RETURNING count`);
 if(Number(result.rows[0]?.count)>maximum) throw new ApiError(429,'tooManyAttempts');
}
