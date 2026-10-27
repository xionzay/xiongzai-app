# Service category publishing

The admin dashboard now has a **服务分类** (Service categories) module. Administrators with `product.read` can view categories; `product.review` plus MFA is required to create or edit them. Every change requires a reason and records before/after values in the admin audit log.

## Local setup

Migration `0011_service_categories.sql` adds the category table, listing attributes, package units, and order detail snapshots. It does not change existing listing contents, prices, reservation durations, or historical orders. Create the desired gaming-service categories in the admin module before publishing through the updated native app. No speculative product categories are seeded.

Each category has a name, enabled status, and up to 20 public text fields. Each field has a stable key, label, and optional required flag. Field keys must be unique. These fields are public service details, not credentials or identity records.

## Publishing

The native seller create/edit forms load enabled categories and render their fields. Drafts may omit required answers; the server checks required fields and rejects unknown attributes when submitting for review. Selecting another category clears the previous category's answers. The existing approval/rejection, off-sale, restoration, and audit flow remains in charge of publication.

The create screen previews the listing before submission. If any step fails after a draft is created, it links to that draft instead of creating another on retry. The edit screen shows the saved listing details before final submission; save edits before submitting.

Packages contain a total price, billing unit (`SESSION`, `MATCH`, or `HOUR`), included unit count, and separate reservation duration. A package may therefore contain three matches for one package price. Order quantity counts packages. Hour packages must reserve exactly included hours × 60 minutes. Match duration is an estimate, not a promise that every match lasts that long. Existing packages default to one session and retain their original duration.

## Compatibility and history

Older clients can continue creating uncategorized listings and updating existing ones. They cannot remove a category implicitly: an omitted category field preserves the existing selection. Updated native publishing requires choosing a category. Existing uncategorized services remain editable and sellable.

Submission captures the current category name, field labels, field definitions, answers, and package units in the product review snapshot. Subsequent category edits do not rewrite submitted or approved service details. New orders copy those details into their own snapshot; later listing/category/package edits do not change purchased details.

Disabling a category prevents new categorized drafts/edits and submissions using it. It does not automatically unpublish approved services or cancel orders. Use existing service governance actions when a service needs to be taken off sale.

## Rollback

Prefer reverting application code while keeping the additive database schema. The down migration requires stopped writers and refuses to remove columns while any categories, new package units, listing attributes, or order detail snapshots exist. Do not delete business records to force rollback.

## Verification

Focused API tests cover category permissions, field validation, disabled categories, stale revisions, immutable review snapshots, package units, and purchased snapshots. Database tests cover legacy preservation, billing constraints, safe rollback refusal and reapplication. Native seller regression tests and API/web/mobile compile checks cover the touched clients. No hosted deployment or manual native/dashboard walkthrough is implied by these checks.
