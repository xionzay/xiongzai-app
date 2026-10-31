import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canEnterSellerCenter, canSubmitSellerService, centToYuanInput, isSellerIdentityForUser, missingSellerApplicationFields, sellerBuyerCacheKeys, sellerEntry, sellerProfileSchema, sellerProfileTextPayload, sellerServiceActions, sellerServiceSchema, sellerSkuSchema, shouldReloadSellerAfterConflict, yuanToCent } from "../src/features/seller/seller-domain";
import type { SellerProfileApiView } from "../src/types/api";

const sellerStatusScreenSource = readFileSync(fileURLToPath(new URL("../src/features/seller/seller-status-screen.tsx", import.meta.url).href), "utf8");
const sellerServiceEditSource = readFileSync(fileURLToPath(new URL("../src/features/seller/seller-service-edit-screen.tsx", import.meta.url).href), "utf8");
const sellerServiceCreateSource = readFileSync(fileURLToPath(new URL("../src/features/seller/seller-service-create-screen.tsx", import.meta.url).href), "utf8");
const sellerServicesSource = readFileSync(fileURLToPath(new URL("../src/features/seller/seller-services-screen.tsx", import.meta.url).href), "utf8");
const sellerOrdersSource = readFileSync(fileURLToPath(new URL("../src/features/seller/seller-orders-summary-screen.tsx", import.meta.url).href), "utf8");
const sellerEarningsSource = readFileSync(fileURLToPath(new URL("../src/features/seller/seller-earnings-summary-screen.tsx", import.meta.url).href), "utf8");
const catalogCardSource = readFileSync(fileURLToPath(new URL("../src/features/home/catalog-card.tsx", import.meta.url).href), "utf8");
const nativePageSource = readFileSync(fileURLToPath(new URL("../src/components/native-page.tsx", import.meta.url).href), "utf8");
const calendarDatePickerSource = readFileSync(fileURLToPath(new URL("../src/components/calendar-date-picker.tsx", import.meta.url).href), "utf8");

const completeSeller: SellerProfileApiView = {
  id: "seller-1", user_id: "user-1", status: "APPROVED", seller_nickname: "熊崽陪练", seller_avatar_file_id: "avatar-1", cover_file_id: null,
  introduction: "这是一段足够完整且真实的陪玩主页自我介绍。", game_rank: "无敌战神", kd: "3.25", preferred_mode: "经典模式", play_style: "团队指挥", game_experience: "多个赛季稳定上分并擅长团队配合。",
  voice_file_id: "voice-1", voice_duration_ms: 15000, accepting_orders: true, rating_avg: "0.00", review_count: 0, completed_order_count: 0, favorite_count: 0,
  approved_at: "2026-08-21T00:00:00.000Z", suspended_reason: null, version: 4, created_at: "2026-08-21T00:00:00.000Z", updated_at: "2026-08-21T00:00:00.000Z"
};

test("买家和陪玩复用同一 User，只有 APPROVED 可以进入陪玩中心", () => {
  assert.equal(isSellerIdentityForUser("user-1", completeSeller), true);
  assert.equal(isSellerIdentityForUser("other-user", completeSeller), false);
  assert.equal(canEnterSellerCenter("APPROVED"), true);
  for (const status of ["NOT_APPLIED", "DRAFT", "PENDING_REVIEW", "REJECTED", "SUSPENDED", "BANNED"] as const) assert.equal(canEnterSellerCenter(status), false);
});

test("SellerStatus 与申请状态映射覆盖申请、补资料、拒绝、通过和暂停", () => {
  assert.equal(sellerEntry("NOT_APPLIED"), "APPLY");
  assert.equal(sellerEntry("DRAFT"), "EDIT_DRAFT");
  assert.equal(sellerEntry("PENDING_REVIEW", "UNDER_REVIEW"), "WAITING");
  assert.equal(sellerEntry("PENDING_REVIEW", "NEEDS_SUPPLEMENT"), "SUPPLEMENT");
  assert.equal(sellerEntry("REJECTED", "REJECTED"), "REJECTED");
  assert.equal(sellerEntry("APPROVED", "APPROVED"), "CENTER");
  assert.equal(sellerEntry("SUSPENDED"), "SUSPENDED");
  assert.equal(sellerEntry("BANNED"), "BANNED");
});

test("陪玩申请资料不完整时阻止提交，媒体缺失不生成假 file_id", () => {
  assert.deepEqual(missingSellerApplicationFields(completeSeller), []);
  const incomplete = { ...completeSeller, seller_avatar_file_id: null, voice_file_id: null, voice_duration_ms: null };
  assert.deepEqual(missingSellerApplicationFields(incomplete), ["陪玩头像"]);
  assert.equal(sellerProfileSchema.safeParse({ sellerNickname: "熊", introduction: "短", gameRank: "", kd: "x", preferredMode: "", playStyle: "", gameExperience: "" }).success, false);
});

test("入驻草稿允许缺资料，提交要求与后端一致，可选字段归一为空值", () => {
  const values = { sellerNickname: "本地测试店铺", introduction: "", gameRank: "", kd: "", preferredMode: "", playStyle: "", gameExperience: "" };
  assert.equal(sellerProfileSchema.safeParse(values).success, true);
  assert.deepEqual(sellerProfileTextPayload(values), { seller_nickname: "本地测试店铺", introduction: null, game_rank: null, kd: null, preferred_mode: null, play_style: null, game_experience: null });
  const minimum = { ...completeSeller, game_rank:null, kd:null, play_style:null, game_experience:null, voice_file_id:null, voice_duration_ms:null };
  assert.deepEqual(missingSellerApplicationFields(minimum), []);
  assert.deepEqual(missingSellerApplicationFields({...minimum,introduction:"  ",preferred_mode:""}), ["主页介绍","擅长模式"]);
  assert.equal(sellerProfileSchema.safeParse({...values,kd:"invalid"}).success, false);
  assert.equal(sellerProfileSchema.safeParse({...values,gameExperience:"a".repeat(501)}).success, false);
});

test("陪玩资料和接单状态的 CAS 冲突必须重新读取服务端版本", () => {
  assert.equal(shouldReloadSellerAfterConflict("RESOURCE_VERSION_CONFLICT"), true);
  assert.equal(shouldReloadSellerAfterConflict("SELLER_STATUS_INVALID"), false);
  assert.equal(completeSeller.version, 4);
});

test("服务状态机只暴露合法操作，平台下架和删除不出现危险入口", () => {
  assert.deepEqual(sellerServiceActions("DRAFT"), ["EDIT", "SUBMIT", "DELETE"]);
  assert.deepEqual(sellerServiceActions("PENDING_REVIEW"), ["VIEW_REVIEW"]);
  assert.deepEqual(sellerServiceActions("ON_SALE"), ["VIEW_REVIEW", "OFF_SALE"]);
  assert.deepEqual(sellerServiceActions("REVIEW_REJECTED"), ["VIEW_REVIEW", "EDIT", "SUBMIT"]);
  assert.deepEqual(sellerServiceActions("ADMIN_OFF_SALE"), ["VIEW_REVIEW"]);
  assert.deepEqual(sellerServiceActions("DELETED"), []);
});

test("至少一个有效 SKU 才可提交审核，金额使用整数分字符串", () => {
  assert.equal(canSubmitSellerService([{ status: "INACTIVE" }, { status: "DELETED" }]), false);
  assert.equal(canSubmitSellerService([{ status: "INACTIVE" }, { status: "ACTIVE" }]), true);
  assert.equal(yuanToCent("88.08"), "8808");
  assert.equal(yuanToCent("9007199254740993.99"), "900719925474099399");
  assert.equal(centToYuanInput("8808"), "88.08");
  assert.equal(sellerSkuSchema.safeParse({ skuName: "双排一小时", description: "", priceYuan: "1.999", durationMinutes: "60" }).success, false);
  assert.equal(sellerServiceSchema.safeParse({ title: "双排上分陪练", description: "这是一段足够完整的服务详情描述，保证超过二十个字。" }).success, true);
});

test("服务提交审核使用应用内二次确认并直接触发真实提交动作", () => {
  assert.match(sellerServiceEditSource, /confirmingSubmit/u);
  assert.match(sellerServiceEditSource, /accessibilityLabel="确认提交服务审核"/u);
  assert.match(sellerServiceEditSource, /void submitReview\(\)/u);
  assert.doesNotMatch(sellerServiceEditSource, /Alert\.alert\("提交审核"/u);
});

test("服务变化会失效买家首页、搜索、收藏、陪玩和服务详情缓存", () => {
  assert.deepEqual(sellerBuyerCacheKeys("seller-1", "product-1"), [["home", "catalog"], ["discovery"], ["favorites"], ["companion", "seller-1"], ["service", "product-1"]]);
});

test("发布服务真实上传主图并绑定 file_id，规格数量与设计稿一致且可增加", () => {
  assert.match(sellerServiceCreateSource, /fileType="PRODUCT_IMAGE"[\s\S]*expectedVisibility="PUBLIC"/u);
  assert.match(sellerServiceCreateSource, /aspect=\{\[1, 1\]\}/u);
  assert.match(sellerServiceCreateSource, /cover_file_id: coverFile\?\.id \?\? null/u);
  assert.match(sellerServiceCreateSource, /replaceSellerServiceImages/u);
  assert.match(sellerServiceCreateSource, /\[createSpecDraft\(\), createSpecDraft\(\)\]/u);
  assert.match(sellerServiceCreateSource, /accessibilityLabel="添加规格"/u);
  assert.match(sellerServiceCreateSource, /KeyboardAvoidingView/u);
  assert.match(sellerServiceCreateSource, /useSellerProfile\(status === "authenticated" && Boolean\(user\)\)/u);
  assert.match(sellerServiceCreateSource, /router\.canGoBack\(\)/u);
  assert.match(sellerServiceCreateSource, /returnTo: "\/seller\/services\/new"/u);
  for (const label of ["尚未申请陪玩身份", "陪玩身份审核中", "申请需要补充资料", "陪玩身份审核未通过", "陪玩资格已暂停", "陪玩资格已封禁", "无法验证陪玩权限"]) assert.match(sellerServiceCreateSource, new RegExp(label, "u"));
});

test("陪玩中心主页面结构与本地设计稿一致", () => {
  assert.match(sellerServicesSource, /<ScrollView horizontal/u);
  assert.match(sellerServicesSource, /productTabs\.map/u);
  assert.match(sellerServicesSource, /<FlatList/u);
  assert.match(sellerServicesSource, /accessibilityLabel="发布服务"/u);
  assert.match(sellerServicesSource, /router\.push\("\/seller\/services\/new"\)/u);
  assert.match(sellerServicesSource, /<ApprovedIllustration kind="plus"/u);
  assert.match(sellerOrdersSource, /label: "待服务", value: "PENDING_SERVICE"/u);
  assert.match(sellerOrdersSource, /label: "新订单", value: "PENDING_ACCEPT"/u);
  assert.match(sellerOrdersSource, /label: "待收货", value: "PENDING_BUYER_CONFIRM"/u);
  assert.match(sellerOrdersSource, /label: "全部"/u);
  assert.match(sellerOrdersSource, /暂无卖家订单/u);
  assert.match(sellerOrdersSource, /<StateBear kind="empty"/u);
  assert.match(sellerOrdersSource, /当前分类暂无订单/u);
  assert.doesNotMatch(sellerOrdersSource, /去看看服务|还没有购买订单/u);
  assert.match(sellerEarningsSource, /useState<RevenueRange>\('本月'\)/u);
  for (const label of ['净收益（元）', '订单收入', '平台服务费', '退款扣减', '收益订单', '服务买家', '平均单笔收益']) assert.ok(sellerEarningsSource.includes(label));
  assert.ok(sellerEarningsSource.includes("href: '/seller/finance'"));
  assert.doesNotMatch(sellerEarningsSource, /router\.push\(["']\/seller\/finance\/withdraw["']\)/u);
});

test("收益累计日期使用可展开日历并限制有效区间，不再要求手工输入", () => {
  assert.match(sellerEarningsSource, /DateField label="开始日期"/u);
  assert.match(sellerEarningsSource, /DateField label="结束日期"/u);
  assert.match(sellerEarningsSource, /minimumDate=\{datePicker === 'end' \? customStart : undefined\}/u);
  assert.match(sellerEarningsSource, /maximumDate=\{datePicker === 'start' \? customEnd : chinaDate\(now.getTime\(\)\)\}/u);
  assert.ok(sellerEarningsSource.includes("range === '自定义'"));
  assert.ok(sellerEarningsSource.includes('revenueBounds(range, customStart, customEnd, now)'));
  assert.doesNotMatch(sellerEarningsSource, /cleanDateInput|keyboardType="numbers-and-punctuation"/u);
  assert.match(calendarDatePickerSource, /<Modal visible=\{visible\}/u);
  assert.match(calendarDatePickerSource, /accessibilityLabel="上个月"/u);
  assert.match(calendarDatePickerSource, /accessibilityLabel="下个月"/u);
  assert.match(calendarDatePickerSource, /onSelect\(cell\); onClose\(\);/u);
});

test("买家商品卡固定高度且长标题单行省略，表单页面统一避让键盘", () => {
  assert.match(catalogCardSource, /numberOfLines=\{grid \? 1 : 2\} ellipsizeMode="tail"/u);
  assert.match(catalogCardSource, /gridCopy: \{ minHeight: 124/u);
  assert.match(nativePageSource, /KeyboardAvoidingView/u);
  assert.match(nativePageSource, /behavior=\{Platform\.OS === "ios" \? "padding" : "height"\}/u);
  assert.match(nativePageSource, /keyboardShouldPersistTaps="handled"/u);
});

test("陪玩申请状态页对齐原设计并只展示服务端真实审核资料", () => {
  for (const label of ["陪玩申请状态", "审核通过后开启陪玩中心", "基本资料", "游戏资料", "平台审核", "陪玩身份审核已通过", "你已经可以创建公开陪玩主页、发布服务和处理卖家订单。", "返回设置切换身份", "已提交资料", "真实姓名认证", "和平精英资料", "声音名片", "查看审核记录", "审核记录"]) assert.match(sellerStatusScreenSource, new RegExp(label, "u"));
  assert.match(sellerStatusScreenSource, /useSellerProfile\(\)/u);
  assert.match(sellerStatusScreenSource, /useSellerApplications\(Boolean\(profile\.data\)\)/u);
  assert.match(sellerStatusScreenSource, /useAuth\(\)/u);
  assert.match(sellerStatusScreenSource, /profile\.error instanceof ApiClientError && profile\.error\.code === "SELLER_NOT_FOUND"/u);
  assert.match(sellerStatusScreenSource, /profile\.data\?\.game_rank/u);
  assert.match(sellerStatusScreenSource, /profile\.data\?\.preferred_mode/u);
  assert.match(sellerStatusScreenSource, /profile\.data\?\.voice_duration_ms/u);
  assert.match(sellerStatusScreenSource, /user\?\.identity_verification\?\.status/u);
  assert.match(sellerStatusScreenSource, /applications\.data\.map/u);
  assert.match(sellerStatusScreenSource, /latest\?\.rejection_reason/u);
  assert.match(sellerStatusScreenSource, /latest\?\.required_fields/u);
  assert.match(sellerStatusScreenSource, /router\.dismissTo\("\/settings\/switch-identity"\)/u);
  assert.match(sellerStatusScreenSource, /router\.push\("\/seller\/apply"\)/u);
  assert.doesNotMatch(sellerStatusScreenSource, /无敌战神 · 52 星|sampleApplication|demoApplication|fakeApplication/u);
});
