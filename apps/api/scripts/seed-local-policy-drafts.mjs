import { createDatabaseClient } from "@xiongzai/database";

if (process.env.NODE_ENV === "production" || process.env.DEPLOYMENT_ENV === "production") {
  throw new Error("生产环境禁止运行本地测试协议 Seed。");
}
if (!process.env.DATABASE_URL) throw new Error("缺少环境变量 DATABASE_URL。");
assertLocalDevelopment(process.env.DATABASE_URL);

const disclaimer = "【本地测试草案｜未经正式法律审核】本文件仅用于熊崽电竞本地功能测试，不构成正式法律意见、正式签约文件或平台上线承诺；本轮只记录在线确认并同意，不生成电子签名、签章或第三方电子签约凭证。";
const policies = [
  {
    id: "019b0000-0000-7000-8000-000000000001",
    type: "USER_SERVICE_AGREEMENT",
    title: "用户服务协议（本地测试草案）",
    body: "用户通过中国大陆手机号和开发验证码登录；平台提供一对一游戏陪玩信息展示、订单、Mock 支付、一对一文字聊天和售后测试能力。禁止冒用身份、外挂、欺诈、线下交易引流及其他违法违规行为。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000002",
    type: "PRIVACY_POLICY",
    title: "隐私政策（本地测试草案）",
    body: "本地测试处理手机号脱敏值、账号资料、订单、文字聊天、文件元数据及人工测试实名信息。当前数据仅存放于本地 PostgreSQL 与本地 MinIO，不接真实短信、实名、推送、支付或内容审核服务。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000003",
    type: "PERSONAL_INFORMATION_COLLECTION_LIST",
    title: "个人信息收集清单（本地测试草案）",
    body: "测试清单包括登录手机号、设备标识、昵称头像、订单和售后记录、一对一文字聊天、陪玩资料、10–30 秒声音名片、收款账户脱敏信息及人工测试实名字段。手机号换绑、数据导出和账号注销暂未开放。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000004",
    type: "THIRD_PARTY_SDK_SHARING_LIST",
    title: "第三方 SDK 及共享清单（本地测试草案）",
    body: "本轮不向真实微信支付、支付宝支付、短信、实名、电子签、税务、推送或付费内容审核服务共享信息。支付、打款、短信和审核均使用本地或 Mock Provider；正式接入前必须另行更新清单并重新评估。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000005",
    type: "SYSTEM_PERMISSION_NOTICE",
    title: "系统权限说明（本地测试草案）",
    body: "相册权限用于选择头像、封面和证据；麦克风权限仅用于录制 10–30 秒声音名片；通知能力当前未接真实推送。平台不提供实时语音、视频通话或语音房，拒绝麦克风权限不影响文字聊天。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000006",
    type: "MINOR_PROTECTION_NOTICE",
    title: "未成年人保护说明（本地测试草案）",
    body: "本地测试不代表未成年人保护方案已经完成合规评估。不得使用未成年人真实身份资料或支付账户参与测试；正式上线前须完成年龄识别、监护人机制、消费限制、时段管理和投诉处置设计。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000007",
    type: "ORDER_PAYMENT_REFUND_RULES",
    title: "订单支付退款规则（本地测试草案）",
    body: "订单金额统一以人民币分存储和传输。用户支付渠道仅为 WECHAT_APP、ALIPAY_APP，本轮均由 Mock Provider 模拟且不真实扣款。退款按订单、支付和退款状态机处理，结果以服务端记录和账务流水为准。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000008",
    type: "CHAT_CONTENT_MANAGEMENT_RULES",
    title: "聊天和内容管理规则（本地测试草案）",
    body: "平台只提供一对一文字聊天及系统消息，不提供实时语音、视频通话或语音房。禁止发布违法违规、欺诈、骚扰、外挂、线下引流和敏感个人信息；本轮内容审核为本地 Mock 或人工测试。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000009",
    type: "SELLER_ONBOARDING_AGREEMENT",
    title: "陪玩入驻协议（本地测试草案）",
    body: "陪玩与买家共用同一用户账号，提交资料和人工测试实名后进入人工审核。审核通过前不得发布服务、接单或提现；测试资料不得冒充已经过真实实名认证、资质审查或正式电子签约。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000010",
    type: "SELLER_FULFILLMENT_RULES",
    title: "陪玩履约规则（本地测试草案）",
    body: "陪玩应按已接订单的规格和预约时间提供服务，通过平台一对一文字聊天沟通，按服务端状态机开始和完成履约。禁止私下收款、外挂、代充、辱骂、骚扰以及伪造履约证据。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000011",
    type: "SERVICE_FEE_SETTLEMENT_WITHDRAWAL_RULES",
    title: "服务费、结算和提现规则（本地测试草案）",
    body: "收益、平台服务费、可提现金额和账务流水均以人民币分记录。收款账户和提现渠道严格只支持 WECHAT、ALIPAY，禁止 BANK；本轮仅使用 Mock 打款，不会产生真实资金划转或税务处理。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000012",
    type: "IDENTITY_INFORMATION_SEPARATE_CONSENT",
    title: "实名信息处理单独同意（本地测试草案）",
    body: "本轮实名认证仅为人工功能测试，不连接真实实名渠道。测试人员应使用虚构资料，不得输入真实姓名、证件号码或上传真实证件图片；服务端只返回脱敏状态并保留审计记录。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000013",
    type: "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION",
    title: "声音名片公开试听授权（本地测试草案）",
    body: "陪玩可录制或上传 10–30 秒声音名片，经真实文件校验和人工审核通过后在公开陪玩主页提供受控试听。该授权不包含实时语音、视频通话、语音房、声纹识别或将音频用于其他目的。",
  },
  {
    id: "019b0000-0000-7000-8000-000000000014",
    type: "COMPLAINT_DISPUTE_RULES",
    title: "投诉与争议处理规则（本地测试草案）",
    body: "投诉和争议根据订单、支付、退款、一对一文字聊天及双方提交的已验证材料处理。平台人工测试管理员可要求补充证据并记录处理日志；本轮结论仅用于验证系统流程。",
  },
].map((policy) => ({ ...policy, content: `${disclaimer}\n\n${policy.body}` }));

if (new Set(policies.map((policy) => policy.type)).size !== 14) throw new Error("本地测试协议类型必须恰好为 14 个且不得重复。");

const database = createDatabaseClient({
  connectionString: process.env.DATABASE_URL,
  application_name: "xiongzai-local-policy-drafts-seed",
  max: 1,
});
const connection = await database.pool.connect();
try {
  const info = await connection.query("select current_database() as name");
  if (info.rows[0]?.name !== "xiongzai_api_dev") throw new Error("数据库运行时校验失败：只能写入 xiongzai_api_dev。");
  await connection.query("begin");
  for (const policy of policies) {
    await connection.query(
      `insert into policy_versions
         (id, policy_type, title, content, version_no, status, published_at, effective_at, requires_reacceptance, created_by_admin_id)
       values ($1, $2, $3, $4, 1, 'PUBLISHED', now(), now(), false, null)
       on conflict (policy_type, version_no) do nothing`,
      [policy.id, policy.type, policy.title, policy.content],
    );
  }
  await seedPolicyLifecycleFixtures(connection, disclaimer);
  await seedLocalStateFixtures(connection);
  await connection.query("commit");

  const result = await connection.query(
    `select distinct on (policy_type) policy_type, version_no, status
       from policy_versions
      where policy_type = any($1::varchar[]) and status = 'PUBLISHED'
      order by policy_type, version_no desc`,
    [policies.map((policy) => policy.type)],
  );
  const published = new Set(result.rows.map((row) => row.policy_type));
  const missing = policies.map((policy) => policy.type).filter((type) => !published.has(type));
  if (missing.length > 0) throw new Error(`协议 Seed 后仍缺少已发布类型：${missing.join(", ")}`);
  const fixtureSummary = await connection.query(
    `select
       (select count(*)::integer from users where id = '019b0000-0000-7000-8000-000000000101') as normal_users,
       (select count(*)::integer from identity_verifications where provider_reference = 'LOCAL-POLICY-FIXTURE-PENDING' and status = 'PENDING') as pending_reviews,
       (select count(*)::integer from seller_applications where id = '019b0000-0000-7000-8000-000000000104' and status = 'REJECTED') as rejected_applications,
       (select count(*)::integer from files where id = '019b0000-0000-7000-8000-000000000105' and upload_status = 'FAILED') as failed_uploads`,
  );
  process.stdout.write(`${JSON.stringify({ database: "xiongzai_api_dev", draft_notice: true, formal_legal_review: false, electronic_signature: false, published_policy_types: [...published].sort(), published_count: published.size, local_state_fixtures: fixtureSummary.rows[0] }, null, 2)}\n`);
} catch (error) {
  await connection.query("rollback").catch(() => undefined);
  throw error;
} finally {
  connection.release();
  await database.close();
}

function assertLocalDevelopment(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host)) throw new Error("本地测试协议 Seed 禁止连接非本机数据库。");
  if (decodeURIComponent(parsed.pathname.slice(1)) !== "xiongzai_api_dev") throw new Error("本地测试协议 Seed 只能写入 xiongzai_api_dev。");
}

async function seedPolicyLifecycleFixtures(connection, disclaimer) {
  await connection.query(
    `insert into policy_versions
       (id, policy_type, title, content, version_no, status, requires_reacceptance, created_by_admin_id)
     values
       ('019b0000-0000-7000-8000-000000000015', 'USER_SERVICE_AGREEMENT', '用户服务协议修订稿（本地待审核）', $1, 2, 'DRAFT', true, null)
     on conflict (policy_type, version_no) do nothing`,
    [`${disclaimer}\n\n本版本用于验证草稿、重新同意标记及发布前状态，不应在客户端作为当前协议展示。`],
  );
  await connection.query(
    `insert into policy_versions
       (id, policy_type, title, content, version_no, status, published_at, effective_at, requires_reacceptance, created_by_admin_id)
     values
       ('019b0000-0000-7000-8000-000000000016', 'LOCAL_RETIRED_NOTICE', '已退役说明（本地测试草案）', $1, 1, 'RETIRED', now() - interval '2 days', now() - interval '2 days', false, null)
     on conflict (policy_type, version_no) do nothing`,
    [`${disclaimer}\n\n本记录仅用于验证 RETIRED 生命周期。`],
  );
}

async function seedLocalStateFixtures(connection) {
  const userId = "019b0000-0000-7000-8000-000000000101";
  const sellerId = "019b0000-0000-7000-8000-000000000102";
  const onboardingPolicyId = "019b0000-0000-7000-8000-000000000009";
  await connection.query(
    `insert into users
       (id, phone_ciphertext, phone_hash, phone_mask, status, profile_initialized, version, updated_at)
     values ($1, 'local-test-ciphertext-not-real', $2, '139****9901', 'NORMAL', false, 0, now())
     on conflict (id) do update set status = 'NORMAL', updated_at = now()`,
    [userId, "b".repeat(64)],
  );
  await connection.query(
    `insert into user_policy_acceptances
       (user_id, policy_version_id, acceptance_scene, confirmation_method, accepted_at, ip, user_agent)
     values ($1, $2, 'SELLER_ONBOARDING', 'ONLINE_CONFIRM', now(), '127.0.0.1', 'local-database-fixture-seed')
     on conflict (user_id, policy_version_id) do nothing`,
    [userId, onboardingPolicyId],
  );
  const seller = await connection.query(
    `insert into seller_profiles
       (id, user_id, status, seller_nickname, accepting_orders, version, updated_at)
     values ($1, $2, 'PENDING_REVIEW', '本地待审核状态陪玩', false, 0, now())
     on conflict (user_id) do update set status = 'PENDING_REVIEW', accepting_orders = false, updated_at = now()
     returning id`,
    [sellerId, userId],
  );
  await connection.query(
    `insert into identity_verifications
       (id, user_id, provider, provider_reference, legal_name_ciphertext, legal_name_hash, legal_name_mask,
        document_ciphertext, document_hash, document_mask, status, submitted_at, version, updated_at)
     values
       ('019b0000-0000-7000-8000-000000000103', $1, 'LOCAL_DATABASE_FIXTURE', 'LOCAL-POLICY-FIXTURE-PENDING',
        'local-name-ciphertext-not-real', $2, '测*', 'local-document-ciphertext-not-real', $3, 'LOCAL********0001', 'PENDING', now(), 0, now())
     on conflict (provider, provider_reference) do nothing`,
    [userId, "c".repeat(64), "d".repeat(64)],
  );
  await connection.query(
    `insert into seller_applications
       (id, seller_id, version_no, onboarding_policy_version_id, snapshot_json, status, submitted_at,
        reviewed_at, rejection_reason, version, updated_at)
     values
       ('019b0000-0000-7000-8000-000000000104', $1, 1, $2, '{"fixture":"local-rejected"}'::jsonb,
        'REJECTED', now() - interval '1 hour', now(), '本地测试驳回样例', 0, now())
     on conflict (seller_id, version_no) do nothing`,
    [seller.rows[0].id, onboardingPolicyId],
  );
  await connection.query(
    `insert into files
       (id, owner_user_id, bucket, object_key, file_type, mime_type, size_bytes, sha256,
        upload_status, moderation_status, visibility, updated_at)
     values
       ('019b0000-0000-7000-8000-000000000105', $1, 'local-test-fixtures', 'failed/local-upload.bin',
        'ADMIN_EVIDENCE', 'application/octet-stream', 1, $2, 'FAILED', 'PENDING', 'PRIVATE', now())
     on conflict (bucket, object_key) do update set upload_status = 'FAILED', moderation_status = 'PENDING', updated_at = now()`,
    [userId, "e".repeat(64)],
  );
}
