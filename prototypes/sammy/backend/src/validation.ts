import { z } from 'zod';
export const phone=z.string().regex(/^1[3-9][0-9]{9}$/);
const password=z.string().min(12).max(128);
export const credentials=z.object({phone,password}).strict();
export const draftSchema=z.object({
  gameName:z.string().trim().min(1).max(32),gameId:z.string().trim().regex(/^[A-Za-z0-9_-]{4,32}$/),
  server:z.enum(['wechat','qq']),rank:z.string().trim().min(1).max(40),kd:z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/),
  experience:z.string().trim().min(1).max(160),playStyle:z.string().trim().min(1).max(160),mode:z.enum(['duo','squad']),voiceMediaId:z.uuid().nullable().default(null),
}).strict();
export const registerSchema=credentials.extend({nickname:z.string().trim().min(2).max(24),bio:z.string().trim().max(160).default(''),accepted:z.literal(true),draft:draftSchema.optional()}).strict();
export const profileSchema=z.object({nickname:z.string().trim().min(2).max(24).optional(),bio:z.string().trim().max(160).optional(),avatarMediaId:z.uuid().nullable().optional(),draft:draftSchema.optional()}).strict().refine(value=>Object.keys(value).length>0,'At least one field is required.');
export const submitSchema=z.object({accepted:z.literal(true)}).strict();
export const reviewSchema=z.object({decision:z.enum(['approved','changes_requested']),reason:z.string().trim().max(1000).default('')}).strict().refine(x=>x.decision!=='changes_requested'||x.reason.length>=5,'A reason is required.');
export const uploadSchema=z.object({kind:z.enum(['avatar','voice','evidenceImage','evidenceVideo']),mime:z.enum(['image/jpeg','image/png','image/webp','audio/mp4','audio/mpeg','audio/aac','video/mp4']),bytes:z.number().int().positive().max(50*1024*1024)}).strict().refine(x=>x.mime.startsWith(x.kind==='avatar'||x.kind==='evidenceImage'?'image/':x.kind==='evidenceVideo'?'video/':'audio/')&&((x.kind!=='avatar'&&x.kind!=='evidenceImage')||x.bytes<=8*1024*1024)&&(x.kind!=='voice'||x.bytes<=10*1024*1024),'Invalid file type or size.');
export type Draft=z.infer<typeof draftSchema>;
export type Snapshot={nickname:string;bio:string;avatarMediaId:string;draft:Draft};
export class ApiError extends Error { constructor(public statusCode:number, public code:string){super(code);} }
