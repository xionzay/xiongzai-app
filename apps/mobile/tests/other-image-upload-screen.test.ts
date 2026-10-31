import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { recoverImageUploadState } from "../src/features/files/file-upload-domain";
import type { RecoverableFileApiView } from "../src/types/api";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), "utf8");
}

const slot = source("../src/features/files/image-upload-slot.tsx");
const uploadDomain = source("../src/features/files/file-upload-domain.ts");
const uploadApi = source("../src/features/files/file-upload-api.ts");
const sellerApplication = source("../src/features/seller/seller-application-screen.tsx");
const sellerProfile = source("../src/features/seller/seller-profile-screen.tsx");
const serviceCreate = source("../src/features/seller/seller-service-create-screen.tsx");
const serviceEdit = source("../src/features/seller/seller-service-edit-screen.tsx");
const complaint = source("../src/features/after-sale/complaint-create-screen.tsx");

test("四类图片用途均接入复用上传槽，并保留公开与私有用途隔离", () => {
  assert.match(sellerApplication, /fileType="SELLER_AVATAR"[\s\S]*expectedVisibility="PUBLIC"/u);
  assert.match(sellerApplication, /fileType="SELLER_COVER"[\s\S]*expectedVisibility="PUBLIC"/u);
  assert.match(sellerProfile, /fileType="SELLER_AVATAR"[\s\S]*expectedVisibility="PUBLIC"/u);
  assert.match(sellerProfile, /fileType="SELLER_COVER"[\s\S]*expectedVisibility="PUBLIC"/u);
  assert.match(serviceCreate, /fileType="PRODUCT_IMAGE"[\s\S]*expectedVisibility="PUBLIC"/u);
  assert.match(serviceCreate, /cover_file_id: coverFile\?\.id \?\? null/u);
  assert.match(serviceCreate, /replaceSellerServiceImages/u);
  assert.match(serviceEdit, /fileType="PRODUCT_IMAGE"[\s\S]*expectedVisibility="PUBLIC"/u);
  assert.match(complaint, /fileType="COMPLAINT_EVIDENCE"[\s\S]*expectedVisibility="PRIVATE"/u);
  assert.match(complaint, /fileType="COMPLAINT_EVIDENCE"[\s\S]*requireApproval/u);
});

test("已通过陪玩的公开资料变更生成审核快照且不会直接覆盖买家主页", () => {
  assert.match(sellerProfile, /saveSellerProfileRevision/u);
  assert.match(sellerProfile, /submitSellerProfileRevision/u);
  assert.match(sellerProfile, /审核通过前，买家仍看到当前公开版本/u);
  assert.match(sellerProfile, /接单开关即时生效，不进入资料审核/u);
  assert.match(sellerProfile, /pending_profile_revision/u);
  assert.doesNotMatch(sellerProfile, /陪玩公开资料已保存/u);
});

test("商品图和详情图契约最多三十张且支持排序、首图和解绑，投诉凭证最多六张", () => {
  assert.match(serviceEdit, /product\.images\.length >= 30/u);
  assert.match(serviceEdit, /product\.images\.length < 30/u);
  assert.match(serviceEdit, /image_kind: image\.image_kind/u);
  assert.match(serviceEdit, /is_cover/u);
  assert.match(serviceEdit, /图片顺序已更新/u);
  assert.match(serviceEdit, /图片已从服务移除/u);
  assert.match(serviceEdit, /<FileImage/u);
  assert.match(complaint, /fileIds\.length >= 6/u);
  assert.match(complaint, /fileIds\.length < 6/u);
  assert.match(complaint, /从本次投诉移除/u);
});

test("上传槽从服务端恢复任务，并区分继续确认、待审、通过、拒绝和失败", () => {
  assert.match(uploadApi, /\/me\/files/u);
  assert.match(slot, /queryKey: \["my-files", props\.fileType\]/u);
  assert.match(uploadDomain, /file\.upload_status === "PENDING" \|\| file\.upload_status === "UPLOADED"/u);
  assert.match(uploadDomain, /只重试服务端确认，不要重复上传/u);
  assert.match(uploadDomain, /moderation_status === "APPROVED"/u);
  assert.match(uploadDomain, /moderation_status === "REJECTED"/u);
  assert.match(uploadDomain, /file\.upload_status === "FAILED"/u);
});

test("上传恢复状态只在初始化消费一次，排除当前绑定文件且不会要求重复 PUT", () => {
  const pending = recoverableFile({ id: "pending", upload_status: "PENDING" });
  const approved = recoverableFile({ id: "approved", upload_status: "VERIFIED", moderation_status: "APPROVED" });
  const restored = recoverImageUploadState([pending, approved], null, "服务图片");
  assert.equal(restored.file?.id, "pending");
  assert.equal(restored.confirmationPending, true);
  assert.equal(restored.stage, "pending_review");
  assert.match(restored.message ?? "", /只重试服务端确认，不要重复上传/u);

  const excludingCurrent = recoverImageUploadState([pending, approved], "pending", "服务图片");
  assert.equal(excludingCurrent.file?.id, "approved");
  assert.equal(excludingCurrent.confirmationPending, false);
  assert.equal(excludingCurrent.stage, "approved");
  assert.equal(recoverImageUploadState([approved], "approved", "服务图片").file, null);
  assert.match(slot, /key=\{`\$\{props\.fileType\}:\$\{props\.currentFileId \?\? "none"\}`\}/u);
  assert.doesNotMatch(slot, /setRecoveryChecked|recoveryChecked/u);
});

test("上传任务单飞且卸载时取消，不把短时地址或本地路径写入持久层和日志", () => {
  assert.match(slot, /if \(!asset \|\| task\.current\) return;/u);
  assert.match(slot, /task\.current\?\.abort\(\)/u);
  assert.match(slot, /mounted\.current = false/u);
  assert.doesNotMatch(slot, /AsyncStorage|localStorage|sessionStorage|console\.|upload\.url|presigned_url/u);
});

test("正式公开图片使用 FileImage 按 file_id 获取，不持久化临时访问地址", () => {
  assert.match(slot, /<FileImage fileId=\{currentFileId\}/u);
  assert.match(serviceEdit, /<FileImage fileId=\{image\.file_id\}/u);
  assert.doesNotMatch(serviceEdit, /content_url|presigned_url|object_key/u);
  assert.doesNotMatch(complaint, /content_url|presigned_url|object_key/u);
});

function recoverableFile(overrides: Partial<RecoverableFileApiView>): RecoverableFileApiView {
  return {
    id: "file-1", file_type: "PRODUCT_IMAGE", mime_type: "image/png", size_bytes: "128",
    width: 64, height: 64, duration_ms: null, upload_status: "VERIFIED", moderation_status: "PENDING",
    visibility: "PUBLIC", created_at: "2026-08-22T00:00:00.000Z", updated_at: "2026-08-22T00:00:00.000Z",
    ...overrides
  };
}
