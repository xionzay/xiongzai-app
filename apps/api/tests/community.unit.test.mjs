import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { announcementStatuses, feedbackStatuses, notificationCategories, notificationCategoriesWithFeedback, relatedObjectTypes, relatedObjectTypesWithCommunity } from "@xiongzai/contracts";
import { AdminAnnouncementController, AdminFeedbackController, PublicAnnouncementController, UserFeedbackController } from "../dist/community.controllers.js";
import { loadApiConfig } from "../dist/index.js";

const environment = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1/test",
  ...Object.fromEntries(["USER_TOKEN_SECRET", "ADMIN_TOKEN_SECRET", "INTERNAL_TOKEN_SECRET", "CURSOR_SIGNING_SECRET", "PII_ENCRYPTION_KEY", "PII_HMAC_KEY", "AUTH_HMAC_KEY"].map(key => [key, randomBytes(32).toString("hex")])),
};

test("community contracts extend notification capabilities without breaking legacy unions", () => {
  assert.deepEqual(notificationCategories, ["ORDER", "ACCOUNT", "PLATFORM"]);
  assert.deepEqual(notificationCategoriesWithFeedback, [...notificationCategories, "FEEDBACK"]);
  assert.deepEqual(relatedObjectTypesWithCommunity, [...relatedObjectTypes, "FEEDBACK", "ANNOUNCEMENT"]);
  assert.deepEqual(feedbackStatuses, ["SUBMITTED", "PROCESSING", "REPLIED"]);
  assert.deepEqual(announcementStatuses, ["DRAFT", "PUBLISHED", "RETIRED"]);
});

test("feedback local limits are bounded, configurable and invalid values are not echoed", () => {
  const defaults = loadApiConfig(environment);
  assert.equal(defaults.feedbackMaxCharacters, 2000); assert.equal(defaults.feedbackHourlyLimit, 5);
  const configured = loadApiConfig({ ...environment, FEEDBACK_MAX_CHARACTERS: "5000", FEEDBACK_HOURLY_LIMIT: "100" });
  assert.equal(configured.feedbackMaxCharacters, 5000); assert.equal(configured.feedbackHourlyLimit, 100);
  for (const [key, value] of [["FEEDBACK_MAX_CHARACTERS", "5001"], ["FEEDBACK_HOURLY_LIMIT", "0"], ["FEEDBACK_HOURLY_LIMIT", "private-invalid-sentinel"]]) {
    assert.throws(() => loadApiConfig({ ...environment, [key]: value }), error => error.message.includes(key) && !error.message.includes(value));
  }
});

test("community route metadata keeps private user routes, MFA and distinct admin permissions", () => {
  assert.equal(Reflect.getMetadata("xiongzai:public", PublicAnnouncementController), true);
  assert.notEqual(Reflect.getMetadata("xiongzai:public", UserFeedbackController), true);
  for (const controller of [AdminFeedbackController, AdminAnnouncementController]) assert.equal(Reflect.getMetadata("xiongzai:mfa-required", controller), true);
  for (const [controller, method, permission] of [[AdminFeedbackController, "reply", "feedback.reply"], [AdminFeedbackController, "process", "feedback.manage"], [AdminAnnouncementController, "publish", "announcement.publish"], [AdminAnnouncementController, "retire", "announcement.publish"], [AdminAnnouncementController, "edit", "announcement.manage"]]) {
    assert.ok(Reflect.getMetadata("xiongzai:permissions", controller.prototype[method]).includes(permission));
    assert.notEqual(Reflect.getMetadata("xiongzai:public", controller.prototype[method]), true);
  }
});
