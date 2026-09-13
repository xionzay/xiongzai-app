import { adminAccounts, adminMfaFactors, adminRoles, permissions, rolePermissions, roles, createDatabaseClient, uuidv7 } from "@xiongzai/database";
import { eq } from "drizzle-orm";
import { hashAdminPassword, SensitiveDataProtector } from "../dist/index.js";

if (process.env.NODE_ENV === "production") throw new Error("生产环境禁止使用本地管理员引导脚本。");
const required=["DATABASE_URL","PII_ENCRYPTION_KEY","PII_HMAC_KEY","AUTH_HMAC_KEY","ADMIN_BOOTSTRAP_USERNAME","ADMIN_BOOTSTRAP_PASSWORD","ADMIN_BOOTSTRAP_TOTP_SECRET"];
for(const name of required)if(!process.env[name])throw new Error(`缺少环境变量 ${name}`);
const username=process.env.ADMIN_BOOTSTRAP_USERNAME.normalize("NFKC").trim().toLowerCase();
const displayName=(process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME??"本地超级管理员").normalize("NFKC").trim();
if(!/^[a-z][a-z0-9_.-]{2,63}$/u.test(username))throw new Error("ADMIN_BOOTSTRAP_USERNAME 格式无效");
if(!/^[A-Z2-7]{16,128}$/u.test(process.env.ADMIN_BOOTSTRAP_TOTP_SECRET.replaceAll(" ","").toUpperCase()))throw new Error("ADMIN_BOOTSTRAP_TOTP_SECRET 必须是 Base32 字符串");
const permissionKeys=["dashboard.read","system_health.read","admin.read","admin.manage","role.read","role.manage","user.read","user.status.manage","identity.read","identity.review","seller.read","seller_application.read","seller_application.review","seller.status.manage","product.read","product.review","file.read","file.manage","file.review","order.read","payment.read","refund.read","refund.manage","complaint.read","complaint.manage","review.read","review.manage","support.read","support.manage","support.reply","conversation.evidence.read","finance.read","finance.manage","withdrawal.read","withdrawal.manage","policy.read","policy.manage","risk.read","risk.manage","security_log.read","admin_log.read","config.read","config.manage","global_search.read"];
const client=createDatabaseClient({connectionString:process.env.DATABASE_URL,application_name:"xiongzai-admin-bootstrap",max:1});
try{
  await client.db.transaction(async(tx)=>{
    const existing=await tx.select({id:adminAccounts.id}).from(adminAccounts).where(eq(adminAccounts.username,username)).limit(1);if(existing[0])throw new Error("该管理员账号已存在，脚本未做任何修改");
    const adminId=uuidv7();const roleId=uuidv7();const protector=new SensitiveDataProtector(process.env.PII_ENCRYPTION_KEY,process.env.PII_HMAC_KEY,process.env.AUTH_HMAC_KEY);
    await tx.insert(adminAccounts).values({id:adminId,username,displayName,passwordHash:await hashAdminPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD),mfaRequired:true});
    await tx.insert(adminMfaFactors).values({id:uuidv7(),adminId,factorType:"TOTP",secretCiphertext:protector.encrypt("admin-mfa",process.env.ADMIN_BOOTSTRAP_TOTP_SECRET.replaceAll(" ","").toUpperCase()),label:"本地验证器",verifiedAt:new Date()});
    await tx.insert(roles).values({id:roleId,roleKey:`local_super_admin_${adminId.slice(0,8)}`,name:"本地超级管理员",description:"仅通过显式引导命令创建"});
    const permissionIds=[];for(const key of permissionKeys){const [row]=await tx.insert(permissions).values({id:uuidv7(),permissionKey:key,description:key,highRisk:key.endsWith("manage")||key.includes("evidence")||key.includes("review")}).onConflictDoUpdate({target:permissions.permissionKey,set:{description:key}}).returning({id:permissions.id});permissionIds.push(row.id)}
    await tx.insert(rolePermissions).values(permissionIds.map((permissionId)=>({roleId,permissionId})));await tx.insert(adminRoles).values({adminId,roleId,grantedByAdminId:null});
  });
  process.stdout.write("本地管理员已创建；密码和 TOTP 密钥未输出。\n");
}finally{await client.close()}
