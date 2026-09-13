import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { accountCapabilityAvailability, identityFormSchema, isMaskedSensitiveValue, optimisticPrivacy, permissionCopy, policyVersionIds, profileEditSchema, requiresDoubleConfirmation, serverFileReference, sessionRevokeOutcome, shouldReloadProfileAfterConflict } from "../src/features/account/account-domain";

const mineScreenSource = readFileSync(fileURLToPath(new URL("../src/features/account/mine-screen.tsx", import.meta.url).href), "utf8");
const publicUserScreenSource = readFileSync(fileURLToPath(new URL("../src/features/chat/public-user-screen.tsx", import.meta.url).href), "utf8");
const couponsScreenSource = readFileSync(fileURLToPath(new URL("../app/coupons.tsx", import.meta.url).href), "utf8");
const profileEditScreenSource = readFileSync(fileURLToPath(new URL("../src/features/account/profile-edit-screen.tsx", import.meta.url).href), "utf8");
const securityScreenSource = readFileSync(fileURLToPath(new URL("../src/features/account/security-screen.tsx", import.meta.url).href), "utf8");
const rulesScreenSource = readFileSync(fileURLToPath(new URL("../src/features/account/rules-screen.tsx", import.meta.url).href), "utf8");
const settingsScreenSource = readFileSync(fileURLToPath(new URL("../src/features/account/settings-screen.tsx", import.meta.url).href), "utf8");

test("个人资料提交保留双版本，版本冲突必须刷新而不是覆盖", () => {
  assert.deepEqual(profileEditSchema.parse({ nickname: "熊崽玩家", bio: "一起开黑" }), { nickname: "熊崽玩家", bio: "一起开黑" });
  assert.equal(shouldReloadProfileAfterConflict("RESOURCE_VERSION_CONFLICT"), true);
  assert.equal(shouldReloadProfileAfterConflict("NETWORK_TIMEOUT"), false);
});

test("隐私开关支持乐观更新，原快照保持可用于失败回滚", () => {
  const snapshot = { show_online_status: true, show_public_profile: true, personalized_recommendations: true, version: 4, updated_at: "2026-08-21T00:00:00.000Z" };
  const optimistic = optimisticPrivacy(snapshot, "show_online_status", false);
  assert.equal(optimistic.show_online_status, false);
  assert.equal(optimistic.version, 4);
  assert.equal(snapshot.show_online_status, true);
});

test("手机号、实名信息只接受脱敏展示，实名表单拒绝无效输入", () => {
  assert.equal(isMaskedSensitiveValue("135****0001"), true);
  assert.equal(isMaskedSensitiveValue("110101199001011234"), false);
  assert.equal(identityFormSchema.safeParse({ legalName: "张", documentNumber: "123" }).success, false);
  assert.equal(identityFormSchema.safeParse({ legalName: "张安全", documentNumber: "110101199001011234" }).success, true);
});

test("协议接受使用服务端当前版本 ID，登录和支付可以选择不同必需集合", () => {
  const policies = [{ id: "u1", policy_type: "USER_SERVICE_AGREEMENT" }, { id: "p1", policy_type: "PRIVACY_POLICY" }, { id: "t1", policy_type: "ORDER_PAYMENT_REFUND_RULES" }] as const;
  const views = policies.map((item) => ({ ...item, title: item.policy_type, content: "content", version_no: 1, published_at: "2026-08-21T00:00:00.000Z" }));
  assert.deepEqual(policyVersionIds(views), ["u1", "p1", "t1"]);
  assert.deepEqual(policyVersionIds(views, ["ORDER_PAYMENT_REFUND_RULES"]), ["t1"]);
});

test("撤销当前 Session 清理认证，其他 Session 只刷新列表", () => {
  assert.equal(sessionRevokeOutcome({ current: true }), "CLEAR_LOCAL_AUTH");
  assert.equal(sessionRevokeOutcome({ current: false }), "REFETCH_SESSIONS");
});

test("危险注销要求二次确认，未开放能力和媒体上传不伪造成功", () => {
  assert.equal(requiresDoubleConfirmation("ACCOUNT_CANCELLATION"), true);
  assert.deepEqual(accountCapabilityAvailability, { dataExport: false, phoneChange: false, accountCancellation: false, fileUpload: true });
  assert.equal(serverFileReference(false, "fake-file-id"), null);
  assert.equal(serverFileReference(true, "verified-file-id"), "verified-file-id");
});

test("系统权限拒绝与设置引导使用明确文案", () => {
  assert.equal(permissionCopy("granted"), "已授权");
  assert.equal(permissionCopy("denied"), "未授权");
  assert.equal(permissionCopy("unavailable"), "当前构建未接入");
});

test("我的页面保留原设计的天空背景、双资产卡和带说明菜单", () => {
  assert.match(mineScreenSource, /skyBands/u);
  assert.match(mineScreenSource, /height:\s*110/u);
  assert.match(mineScreenSource, /height:\s*137/u);
  assert.match(mineScreenSource, /height:\s*67/u);
  assert.match(mineScreenSource, /个人资料与常用功能/u);
  assert.match(mineScreenSource, /styles\.assets/u);
  assert.match(mineScreenSource, /FavoriteMenuIcon color="#FFB319" size=\{62\}/u);
  assert.match(mineScreenSource, /CouponActionIcon color="#2F8FE5" size=\{62\}/u);
  assert.match(mineScreenSource, /assetIcon: \{ width: 62, height: 62, alignItems: "center", justifyContent: "center" \}/u);
  assert.doesNotMatch(mineScreenSource, /ui-(?:star|coupon)-rounded\.jpg/u);
  assert.match(mineScreenSource, /<TargetIcon size=\{28\}/u);
  assert.match(mineScreenSource, /陪玩 \$\{sellerFavorites\} · 服务 \$\{serviceFavorites\}/u);
  assert.match(mineScreenSource, /\$\{unreadCount\} 条未读/u);
  assert.match(mineScreenSource, /设置与隐私/u);
  assert.match(mineScreenSource, /陪玩身份申请入口/u);
});

test("买家公开主页对齐原设计并只展示服务端公开资料与评价", () => {
  for (const label of ["买家主页", "其他用户可见的公开资料", "关注", "公开评价", "加入平台", "仅展示已公开内容", "暂无公开评价", "投诉该用户"]) assert.match(publicUserScreenSource, new RegExp(label, "u"));
  assert.match(publicUserScreenSource, /usePublicUser\(id\)/u);
  assert.match(publicUserScreenSource, /user\.following_count/u);
  assert.match(publicUserScreenSource, /user\.public_review_count/u);
  assert.match(publicUserScreenSource, /joinedDays\(user\.created_at\)/u);
  assert.match(publicUserScreenSource, /const publicReviews = user\.public_reviews \?\? \[\]/u);
  assert.match(publicUserScreenSource, /publicReviews\.map/u);
  assert.match(publicUserScreenSource, /user\.online_status/u);
  assert.match(publicUserScreenSource, /pathname: "\/complaints\/new"/u);
  assert.doesNotMatch(publicUserScreenSource, /熊崽玩家 K|10086|162|Kirito|sampleReview|demoReview|fake/u);
});

test("优惠券占位页对齐原设计并明确第一阶段不展示虚假优惠", () => {
  for (const label of ["优惠券", "第一阶段暂不开放使用", "0", "张可用", "优惠券入口保留，后续版本开放领取与核销", "暂无可用优惠券", "第一阶段订单按服务实际价格结算，不展示虚假优惠信息。", "去看看服务"]) assert.match(couponsScreenSource, new RegExp(label, "u"));
  assert.match(couponsScreenSource, /CouponActionIcon color="#2F8FE5" surfaceColor="#DDECFF" size=\{64\}/u);
  assert.doesNotMatch(couponsScreenSource, /ui-coupon-rounded\.jpg/u);
  assert.match(couponsScreenSource, /router\.replace\("\/\(buyer-tabs\)"\)/u);
  assert.doesNotMatch(couponsScreenSource, /useQuery|apiClient|fetch\(|sampleCoupon|demoCoupon|fakeCoupon/u);
});

test("编辑资料页对齐原设计并保留真实头像、脱敏手机和并发保护", () => {
  for (const label of ["编辑个人资料", "公开资料将在陪玩和聊天中展示", "更换", "支持 JPG、PNG，建议使用清晰头像", "昵称", "2–16 个字符", "手机号码", "用于登录与交易安全", "资料安全", "手机号码不会公开展示；昵称与头像需通过内容安全检查。", "保存资料"]) assert.match(profileEditScreenSource, new RegExp(label, "u"));
  assert.match(profileEditScreenSource, /FileImage fileId=\{user\.profile\.avatar_file_id\}/u);
  assert.match(profileEditScreenSource, /user\.phone_mask/u);
  assert.match(profileEditScreenSource, /router\.push\("\/settings\/media-avatar"\)/u);
  assert.match(profileEditScreenSource, /router\.push\("\/settings\/identity"\)/u);
  assert.match(profileEditScreenSource, /profileVersion: user\.profile!\.version, userVersion: user\.version/u);
  assert.match(profileEditScreenSource, /RESOURCE_VERSION_CONFLICT/u);
  assert.match(profileEditScreenSource, /await refreshUser\(\)/u);
  assert.doesNotMatch(profileEditScreenSource, /未登录 ›|熊崽玩家 K|sampleProfile|demoProfile|fake/u);
});

test("隐私与安全页对齐原设计并使用真实脱敏账户状态", () => {
  for (const label of ["隐私与安全", "保护账号和个人数据", "账号安全状态良好", "建议定期核对手机号码与隐私设置", "手机号码", "实名认证", "隐私设置", "在线状态、个性化推荐", "个人数据下载", "申请数据副本", "注销账号", "永久删除账号与个人资料"]) assert.match(securityScreenSource, new RegExp(label, "u"));
  assert.match(securityScreenSource, /user\?\.phone_mask \?\? "--"/u);
  assert.match(securityScreenSource, /identityStatus\(user\?\.identity_verification\?\.status\)/u);
  assert.match(securityScreenSource, /router\.push\("\/settings\/identity"\)/u);
  assert.match(securityScreenSource, /router\.push\("\/settings\/privacy"\)/u);
  assert.match(securityScreenSource, /router\.push\("\/settings\/data-export"\)/u);
  assert.match(securityScreenSource, /router\.push\("\/settings\/account-cancellation"\)/u);
  assert.doesNotMatch(securityScreenSource, /未登录|sampleSecurity|demoSecurity|fake/u);
});

test("协议与隐私中心展示服务端发布版本、分类与真实接受记录入口", () => {
  for (const label of ["协议与隐私中心", "已发布协议、隐私清单与平台规则", "熊崽电竞平台保障", "平台内支付 · 订单留痕 · 退款与投诉介入", "用户、隐私与账号", "登录、个人信息、SDK、系统权限及未成年人保护", "订单支付退款规则", "聊天和内容管理规则", "陪玩入驻与履约", "单独授权与争议规则", "我的协议接受记录", "查看接受版本、使用场景、确认方式和确认时间", "仍然需要帮助？", "联系平台客服处理订单与账号问题"]) assert.match(rulesScreenSource, new RegExp(label, "u"));
  assert.match(rulesScreenSource, /usePolicies\(\)/u);
  assert.match(rulesScreenSource, /usePolicyAcceptances\(Boolean\(user\)\)/u);
  for (const policyType of ["USER_SERVICE_AGREEMENT", "PRIVACY_POLICY", "PERSONAL_INFORMATION_COLLECTION_LIST", "THIRD_PARTY_SDK_SHARING_LIST", "SYSTEM_PERMISSION_NOTICE", "MINOR_PROTECTION_NOTICE", "ORDER_PAYMENT_REFUND_RULES", "CHAT_CONTENT_MANAGEMENT_RULES", "SELLER_ONBOARDING_AGREEMENT", "SELLER_FULFILLMENT_RULES", "SERVICE_FEE_SETTLEMENT_WITHDRAWAL_RULES", "IDENTITY_INFORMATION_SEPARATE_CONSENT", "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION", "COMPLAINT_DISPUTE_RULES"]) assert.match(rulesScreenSource, new RegExp(policyType, "u"));
  assert.match(rulesScreenSource, /acceptedPolicyIds\.has\(policy\.id\)/u);
  assert.match(rulesScreenSource, /pathname: "\/policies\/\[id\]"/u);
  assert.match(rulesScreenSource, /router\.push\("\/support"\)/u);
  assert.match(rulesScreenSource, /policy\.content/u);
  assert.doesNotMatch(rulesScreenSource, /所有交易必须在熊崽电竞平台完成|samplePolicy|demoPolicy|fakePolicy/u);
});

test("设置页对齐原设计并依据真实陪玩状态开放经营入口", () => {
  for (const label of ["设置", "账号、隐私与身份", "SELLER IDENTITY", "陪玩身份", "通过审核后，才可以拥有陪玩主页、发布服务并处理卖家订单。", "申请成为陪玩", "查看申请资料和审核记录", "个人资料", "头像、昵称、手机号", "隐私与安全", "手机号、实名认证、隐私设置", "协议与隐私中心", "协议、隐私清单、权限和接受记录", "退出登录"]) assert.match(settingsScreenSource, new RegExp(label, "u"));
  assert.match(settingsScreenSource, /useSellerProfile\(\)/u);
  assert.match(settingsScreenSource, /sellerEntry\(seller\.data\?\.status \?\? "NOT_APPLIED", seller\.data\?\.latest_application\?\.status\)/u);
  assert.match(settingsScreenSource, /seller\.error instanceof ApiClientError && seller\.error\.code === "SELLER_NOT_FOUND"/u);
  assert.match(settingsScreenSource, /if \(entry === "CENTER"\) router\.push\("\/\(seller-tabs\)"\)/u);
  assert.match(settingsScreenSource, /router\.push\("\/seller\/status"\)/u);
  assert.match(settingsScreenSource, /router\.push\("\/settings\/profile"\)/u);
  assert.match(settingsScreenSource, /router\.push\("\/settings\/security"\)/u);
  assert.match(settingsScreenSource, /router\.push\("\/rules"\)/u);
  assert.match(settingsScreenSource, /await logout\(\)/u);
  assert.doesNotMatch(settingsScreenSource, /sampleSeller|demoSeller|fakeSeller/u);
});
