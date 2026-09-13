import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buyerDisplayState, hasOrderAction, isRefundAmountAllowed, parseYuanToCent, safeComplaintFiles, shouldRefreshAfterConflict } from "../src/features/after-sale/after-sale-domain";
import { AfterSaleIntentStore } from "../src/storage/after-sale-intent";
import type { OrderDetailApiView } from "../src/types/api";
import { MemorySecureStore } from "./test-helpers";

const orderDetailSource = readFileSync(fileURLToPath(new URL("../src/features/checkout/order-detail-screen.tsx", import.meta.url).href), "utf8");
const refundCreateSource = readFileSync(fileURLToPath(new URL("../src/features/after-sale/refund-create-screen.tsx", import.meta.url).href), "utf8");
const refundDetailSource = readFileSync(fileURLToPath(new URL("../src/features/after-sale/refund-detail-screen.tsx", import.meta.url).href), "utf8");
const complaintCreateSource = readFileSync(fileURLToPath(new URL("../src/features/after-sale/complaint-create-screen.tsx", import.meta.url).href), "utf8");
const complaintDetailSource = readFileSync(fileURLToPath(new URL("../src/features/after-sale/complaint-detail-screen.tsx", import.meta.url).href), "utf8");
const reviewCreateSource = readFileSync(fileURLToPath(new URL("../src/features/after-sale/review-create-screen.tsx", import.meta.url).href), "utf8");
const reviewDetailSource = readFileSync(fileURLToPath(new URL("../src/features/after-sale/review-detail-screen.tsx", import.meta.url).href), "utf8");
const companionReviewsSource = readFileSync(fileURLToPath(new URL("../src/features/discovery/companion-reviews-screen.tsx", import.meta.url).href), "utf8");

test("退款金额只接受最多两位小数并使用整数分", () => {
  assert.equal(parseYuanToCent("29.90"), "2990"); assert.equal(parseYuanToCent("0.01"), "1"); assert.equal(parseYuanToCent("1.001"), null); assert.equal(parseYuanToCent("-1"), null);
  assert.equal(isRefundAmountAllowed("2990", "2990"), true); assert.equal(isRefundAmountAllowed("2991", "2990"), false); assert.equal(isRefundAmountAllowed("0", "2990"), false);
});

test("同一退款意图复用幂等键，金额或原因变化生成新键", async () => {
  let sequence = 0; const store = new AfterSaleIntentStore(new MemorySecureStore(), () => String(++sequence));
  const first = await store.refundKey("order-1:1000:reason-a"); const replay = await store.refundKey("order-1:1000:reason-a"); const changed = await store.refundKey("order-1:900:reason-b");
  assert.equal(first, replay); assert.notEqual(first, changed); assert.equal(sequence, 2);
});

test("危险订单按钮完全以服务端 available_actions 为准", () => {
  const order = { available_actions: ["CONFIRM_COMPLETE"] } as OrderDetailApiView;
  assert.equal(hasOrderAction(order, "CONFIRM_COMPLETE"), true); assert.equal(hasOrderAction(order, "REQUEST_REFUND"), false); assert.equal(hasOrderAction(order, "CANCEL"), false);
});

test("售后、全额退款和已评价使用真实字段组合展示", () => {
  assert.equal(buyerDisplayState({ status: "IN_SERVICE", payment_status: "PAID", after_sale_status: "IN_PROGRESS", review: null }), "AFTER_SALE");
  assert.equal(buyerDisplayState({ status: "COMPLETED", payment_status: "REFUNDED", after_sale_status: "RESOLVED", review: null }), "REFUNDED");
  assert.equal(buyerDisplayState({ status: "COMPLETED", payment_status: "PAID", after_sale_status: "NONE", review: { id: "r", status: "PUBLIC", rating: 5, created_at: "now" } }), "REVIEWED");
});

test("版本冲突触发刷新，证据上传缺失时不会提交伪造 file_id", () => {
  assert.equal(shouldRefreshAfterConflict("RESOURCE_VERSION_CONFLICT"), true); assert.equal(shouldRefreshAfterConflict("NETWORK_TIMEOUT"), false);
  assert.deepEqual(safeComplaintFiles(false, ["fake-file"]), []); assert.deepEqual(safeComplaintFiles(true, ["verified-file"]), ["verified-file"]);
});

test("订单详情按原 UI 展示全状态、履约时间线和服务端授权操作", () => {
  for (const label of ["订单详情", "等待陪玩接单", "陪玩已接单 · 待开始", "服务进行中", "等待确认完成", "订单已完成", "售后处理中", "订单已退款", "已付款", "陪玩接单", "开始服务", "买家确认", "平台认证陪玩 · 交易保障中", "订单备注", "下单时间", "支付状态", "实付金额", "平台交易保障中", "完整金额与状态记录", "联系陪玩", "联系平台客服"]) assert.match(orderDetailSource, new RegExp(label, "u"));
  assert.match(orderDetailSource, /buyerDisplayState\(current\)/u);
  assert.match(orderDetailSource, /current\.available_actions\.includes\("PAY"\)/u);
  assert.match(orderDetailSource, /current\.available_actions\.includes\("CANCEL"\)/u);
  assert.match(orderDetailSource, /current\.available_actions\.includes\("CONFIRM_COMPLETE"\)/u);
  assert.match(orderDetailSource, /current\.available_actions\.includes\("REQUEST_REFUND"\)/u);
  assert.match(orderDetailSource, /current\.available_actions\.includes\("CREATE_COMPLAINT"\)/u);
  assert.match(orderDetailSource, /current\.available_actions\.includes\("CREATE_REVIEW"\)/u);
  assert.match(orderDetailSource, /cancelOrder\(current\.id, current\.version/u);
  assert.match(orderDetailSource, /confirmOrderComplete\(current\.id, current\.version\)/u);
  assert.match(orderDetailSource, /createOrderConversation\(current\.id\)/u);
  assert.match(orderDetailSource, /current\.status_logs\.map/u);
  assert.doesNotMatch(orderDetailSource, /预计 3 分钟|14:59|Kirito|¥25\.00/u);
});

test("申请退款页按原 UI 展示真实可退金额、原因菜单、说明和幂等提交", () => {
  for (const label of ["申请退款", "本次最多可退", "退款将原路返回支付账户", "本次退款金额", "退款原因", "陪玩长时间未接单", "预约时间无法履约", "服务与描述不符", "双方协商一致", "其他原因", "补充说明", "退款规则", "提交退款申请"]) assert.match(refundCreateSource, new RegExp(label, "u"));
  assert.match(refundCreateSource, /current\.available_actions\.includes\("REQUEST_REFUND"\)/u);
  assert.match(refundCreateSource, /parseYuanToCent\(amountValue\)/u);
  assert.match(refundCreateSource, /isRefundAmountAllowed\(amountCent, current\.available_refund_amount_cent\)/u);
  assert.match(refundCreateSource, /afterSaleIntentStore\.refundKey\(fingerprint\)/u);
  assert.match(refundCreateSource, /createRefund\(\{ order_id: orderId, amount_cent: amountCent/u);
  assert.match(refundCreateSource, /maxLength=\{200\}/u);
  assert.match(refundCreateSource, /queryClient\.invalidateQueries\(\{ queryKey: \["order", orderId\] \}\)/u);
  assert.match(refundCreateSource, /const cents = BigInt\(value\)/u);
  assert.doesNotMatch(refundCreateSource, /¥25\.00|fake|parseFloat/u);
});

test("退款详情按原 UI 展示全状态、三步进度和真实处理动作", () => {
  for (const label of ["退款详情", "等待陪玩处理", "陪玩已同意退款", "陪玩拒绝退款", "退款协商中", "平台处理中", "退款处理中", "退款已完成", "退款申请未通过", "退款申请已关闭", "买家申请", "陪玩/平台处理", "退款结果", "退款金额", "退款原因", "退款方式", "当前状态", "处理意见", "处理记录", "申请平台介入", "刷新退款进度", "提交订单投诉", "联系平台客服"]) assert.match(refundDetailSource, new RegExp(label, "u"));
  assert.match(refundDetailSource, /refundStatusCopy\[refund\.status\]/u);
  assert.match(refundDetailSource, /refund\.available_actions\.includes\("ESCALATE"\)/u);
  assert.match(refundDetailSource, /escalateRefund\(id, refund\.version, reason\.trim\(\)\)/u);
  assert.match(refundDetailSource, /shouldRefreshAfterConflict\(error\.code\)/u);
  assert.match(refundDetailSource, /\[\.\.\.refund\.logs\]\.reverse\(\)\.map/u);
  assert.match(refundDetailSource, /refund\.approved_amount_cent \?\? refund\.requested_amount_cent/u);
  assert.match(refundDetailSource, /queryClient\.invalidateQueries\(\{ queryKey: \["order", refund\.order_id\] \}\)/u);
  assert.doesNotMatch(refundDetailSource, /23:48:16|¥25\.00|预计 24h|fake/u);
});

test("投诉与平台介入页按原 UI 使用真实对象、私有证据和服务端提交", () => {
  for (const label of ["投诉与平台介入", "关联用户", "关联陪玩", "关联服务", "关联订单", "投诉类型", "服务与描述不符", "陪玩未按约定履约", "诱导线下交易", "不文明沟通", "其他问题", "问题说明", "证据材料", "请如实提交", "提交平台处理"]) assert.match(complaintCreateSource, new RegExp(label, "u"));
  assert.match(complaintCreateSource, /targetId = params\.targetId \|\| params\.orderId/u);
  assert.match(complaintCreateSource, /maxLength=\{500\}/u);
  assert.match(complaintCreateSource, /fileIds\.length >= 6/u);
  assert.match(complaintCreateSource, /fileType="COMPLAINT_EVIDENCE"/u);
  assert.match(complaintCreateSource, /expectedVisibility="PRIVATE"/u);
  assert.match(complaintCreateSource, /safeComplaintFiles\(true, fileIds\)/u);
  assert.match(complaintCreateSource, /createComplaint\(\{ target_type: targetType, target_id: targetId, complaint_type: type/u);
  assert.match(complaintCreateSource, /queryClient\.invalidateQueries\(\{ queryKey: \["order", targetId\] \}\)/u);
  assert.doesNotMatch(complaintCreateSource, /file_ids: \[\]|24 小时|MinIO|独立退款外键|fake/u);
});

test("投诉详情按原 UI 展示全状态、处理进度、私有证据和真实记录", () => {
  for (const label of ["投诉详情", "投诉已提交", "平台已受理", "平台处理中", "需要补充证据", "投诉处理完成", "投诉已关闭", "提交投诉", "平台处理", "处理结果", "投诉类型", "关联订单", "提交时间", "当前处理人", "当前状态", "问题说明", "平台处理结论", "证据材料", "处理记录", "联系客服补充证据", "刷新状态", "刷新进度", "联系客服", "返回订单", "查看最新记录"]) assert.match(complaintDetailSource, new RegExp(label, "u"));
  assert.match(complaintDetailSource, /complaintState\(item\.status\)/u);
  assert.match(complaintDetailSource, /complaintStatusCopy\[item\.status\]/u);
  assert.match(complaintDetailSource, /\[\.\.\.item\.logs\]\.reverse\(\)\.map/u);
  assert.match(complaintDetailSource, /item\.evidences\.map/u);
  assert.match(complaintDetailSource, /item\.admin_result/u);
  assert.match(complaintDetailSource, /relatedType: "COMPLAINT", relatedId: item\.id/u);
  assert.match(complaintDetailSource, /pathname: "\/orders\/\[id\]", params: \{ id: item\.order_id \}/u);
  assert.doesNotMatch(complaintDetailSource, /预计 24 小时|12 小时|evidence\.file_id|assigned_admin_id|fake/u);
});

test("评价服务页按原 UI 使用真实订单、主动评分、标签和匿名选项", () => {
  for (const label of ["评价服务", "真实评价帮助其他玩家选择", "陪玩：", "本次服务体验如何？", "很差", "较差", "一般", "满意", "非常满意", "请选择评分", "评价内容", "技术靠谱", "准时接单", "沟通舒服", "耐心教学", "匿名展示评价", "匿名玩家", "评价规则", "发布评价"]) assert.match(reviewCreateSource, new RegExp(label, "u"));
  assert.match(reviewCreateSource, /useOrderDetail\(orderId\)/u);
  assert.match(reviewCreateSource, /current\.available_actions\.includes\("CREATE_REVIEW"\)/u);
  assert.match(reviewCreateSource, /useState\(0\)/u);
  assert.match(reviewCreateSource, /maxLength=\{300\}/u);
  assert.match(reviewCreateSource, /createReview\(\{ order_id: orderId, rating/u);
  assert.match(reviewCreateSource, /queryClient\.invalidateQueries\(\{ queryKey: \["order", orderId\] \}\)/u);
  assert.match(reviewCreateSource, /queryClient\.invalidateQueries\(\{ queryKey: \["reviews", current\.product_id\] \}\)/u);
  assert.match(reviewCreateSource, /router\.replace\(\{ pathname: "\/reviews\/\[id\]"/u);
  assert.doesNotMatch(reviewCreateSource, /useState\(5\)|maxLength=\{1000\}|fake/u);
});

test("我的评价详情按原 UI 展示真实服务、审核状态、星级和规则", () => {
  for (const label of ["我的评价", "已提交 · 等待审核", "已隐藏 · 不能重新评价", "已发布 · 公开展示", "评价正在审核", "评价当前未展示", "陪玩：", "星评价", "匿名评价", "发布于", "隐藏于", "评价规则", "收起评价规则", "查看关联订单"]) assert.match(reviewDetailSource, new RegExp(label, "u"));
  assert.match(reviewDetailSource, /useMyReview\(id\)/u);
  assert.match(reviewDetailSource, /useOrderDetail\(query\.data\?\.order_id \?\? "", Boolean\(query\.data\?\.order_id\)\)/u);
  assert.match(reviewDetailSource, /reviewStatusCopy\[item\.status\]/u);
  assert.match(reviewDetailSource, /item\.hidden_reason/u);
  assert.match(reviewDetailSource, /item\.anonymous \? "匿名评价" : item\.display_nickname/u);
  assert.match(reviewDetailSource, /new Date\(item\.created_at\)\.toLocaleString\("zh-CN"\)/u);
  assert.match(reviewDetailSource, /pathname: "\/orders\/\[id\]", params: \{ id: item\.order_id \}/u);
  assert.doesNotMatch(reviewDetailSource, /services\[2\]|暂无评价|fake/u);
});

test("全部评价页按原 UI 使用陪玩汇总、真实筛选和分页评价", () => {
  for (const label of ["全部评价", "来自真实完成订单", "条评价", "5 星", "4 星", "3 星及以下", "全部", "最新", "好评", "已购买服务", "真实订单评价", "用户未填写文字评价", "当前筛选暂无评价", "正在加载更多评价", "继续上滑加载更多"]) assert.match(companionReviewsSource, new RegExp(label, "u"));
  assert.match(companionReviewsSource, /useCompanionReviews\(id, enabled\)/u);
  assert.match(companionReviewsSource, /useCompanionDetail\(id, enabled\)/u);
  assert.match(companionReviewsSource, /companion\.data\?\.rating_avg \?\? loadedAverage/u);
  assert.match(companionReviewsSource, /companion\.data\?\.review_count \?\? items\.length/u);
  assert.match(companionReviewsSource, /items\.filter\(\(item\) => item\.rating >= 4\)/u);
  assert.match(companionReviewsSource, /new Date\(right\.created_at\)\.getTime\(\) - new Date\(left\.created_at\)\.getTime\(\)/u);
  assert.match(companionReviewsSource, /flattenUniqueById\(query\.data\?\.pages \?\? \[\]\)/u);
  assert.match(companionReviewsSource, /query\.fetchNextPage\(\)/u);
  assert.match(companionReviewsSource, /pathname: "\/services\/\[id\]", params: \{ id: item\.product_id \}/u);
  assert.doesNotMatch(companionReviewsSource, /companions\[0\]|reviewItems\.length \? .*reduce|fake/u);
});
