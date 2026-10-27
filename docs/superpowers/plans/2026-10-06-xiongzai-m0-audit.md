# Xiongzai M0 implementation audit

**Date:** 6 October 2026, Asia/Shanghai. **Branch:** `codex/marketplace-implementation`.

**Outcome:** The current implementation has a verified legacy baseline and a mapped V3.5 backlog. M0 remains open for the missing source framework, business decisions, named owners, and device/release scope. M1 financial/state migration is not activated.

## Execution evidence

| Check | Result | Boundary |
| --- | --- | --- |
| Workspace build and type checks | PASS | `pnpm backend:typecheck`; includes mobile type check |
| Contract/application tests | 9 passed, 0 failed, 0 skipped | Existing shared contracts/reliability |
| Focused integration baseline | 49 passed, 0 failed, 0 skipped | Identity, catalog, orders, refunds, finance, chat, account lifecycle, user journey, migration rollback; separate test database |
| Mobile baseline before repair | 178 passed, 1 failed, 0 skipped | Failure was obsolete Expo version literals in a test |
| Mobile after repair | 179 passed, 0 failed, 0 skipped | Full suite rerun; no production dependency change |
| Mobile lint and type check after repair | PASS | Native source lint/type check, not device runtime |
| Migration metadata | PASS | `pnpm db:check`; no application migrations applied |
| Native UI, real providers, browser UI | NOT RUN | User-started runtime/device checks remain pending |

Raw local verification logs were recorded under `/private/tmp/xiongzai-m0-20261006/`; those temporary files are not required to interpret this report. No credentials or individual database records are included here.

### First repair

`apps/mobile/tests/native-voice-media.test.ts` expected `expo-audio ~57.0.4`, `expo-document-picker ~57.0.1`, and `expo-file-system ~57.0.5`. The current manifest and installed Expo compatibility metadata use `~57.0.5`, `~57.0.2`, and `~57.0.7`. The test now reads the installed SDK compatibility metadata, requires each dependency to be present, and verifies the manifest against it. Existing background recording/playback assertions remain. The production manifest, lockfile, and voice implementation were preserved.

### Environment and data inventory

- The existing local PostgreSQL 16 cluster was stopped. It was started for this audit using `pnpm db:local:start`; existing data was retained. Stop it when no longer needed using the existing `pnpm db:local:stop` command, provided no other work is using it.
- Local application database: read-only aggregate inventory found 0 orders, 0 payments, 0 refunds, and 0 seller incomes. This is not evidence about staging, production, or external databases.
- Test URL passed the repository's local/separate-test-database safety validation. Its public schema had no application tables (42P01); integration suites created and cleaned their own isolated random schemas and passed.
- Configured providers: development SMS, mock payment, mock payout, local MinIO. No provider account eligibility or live channel behavior was verified.
- Metro, API, worker, scheduler, frontend, and simulator processes were not started by this batch; PostgreSQL was the only service started.
- Existing uncommitted files were fingerprinted before editing. The only intentional update to a previously changed/untracked file is the implementation-plan progress record; final preservation checks are recorded below.

## Source manifest

| File | Bytes | SHA-256 |
| --- | --- | --- |
| Xiongzai-Esports-Platform-Business-Overview-V2.1-English.docx | 44060 | `ff8e56627b12aab9a8b8dd5f9e8b9309d1283d675602d37dfb2619cdc3c6fd37` |
| Xiongzai-User-App-PRD-V3.5-English.docx | 94248 | `c292ed7f6a95818193aa3db4213ed1c051c0050725c29000fb0acfc4af967944` |
| Xiongzai-Esports-Third-Party-Service-Checklist-Simple-V1.7.xlsx | 25312 | `c295cafc5e5141059e148caed3083cbf0805ff80ff8596090f318fabeb4896e6` |
| Xiongzai Esports MVP to Full Product Development Plan.pdf | 386762 | `ecc8e74a060c23aad9b3c6be95d5051f9d4d9e1092ec271581ce1e03ee10a10f` |

The source documents are in `/Users/codecrafterx/Desktop/Xiongzai docs/`. The separate Transaction and After-Sales Framework V3.1 was not found there. Its 37 K cases and 20 J liability rules remain explicitly unverified. Other business-plan PDFs in that folder were not promoted to the baseline.

## Verified gaps and reusable owners

The registry maps current owners, not completed V3.5 capabilities. A passing old test does not pass a new acceptance case. API entries identify existing route families; missing targets are labeled explicitly. Schema names below are TypeScript exports in `packages/database/src/schema.ts`. Owner roles need assignment to people when team capacity is confirmed.

### account

- **Milestone / action:** M2/M6; Extend.
- **Owner role:** Mobile + accounts backend.
- **Code:** apps/mobile/src/features/account/account-api.ts; apps/api/src/identity-user.service.ts; apps/api/src/user-lifecycle.service.ts.
- **API:** /api/v1/auth; /api/v1/me; /api/v1/policies.
- **Schema:** users, userProfiles, identityVerifications, authSessions, userPolicyAcceptances, phoneChangeRequests, personalDataExportJobs, accountCancellationRequests.
- **Admin dependency:** Identity review; policy publication; lifecycle review.
- **Existing regression suites:** identity-user.integration.test.mjs; user-lifecycle.integration.test.mjs; stage-6-account.test.ts.
- **Current gap:** Local login and lifecycle paths exist; real identity/SMS and V3.5 adult/role/retention rules need acceptance.
- **Related decisions:** D01, D14, D16, B01, B02.

### catalog

- **Milestone / action:** M2; Extend.
- **Owner role:** Mobile + catalog backend + review operations.
- **Code:** apps/mobile/src/features/home/home-screen.tsx; apps/mobile/src/features/discovery/discovery-api.ts; apps/api/src/seller-product.service.ts.
- **API:** /api/v1/services; /api/v1/companions; /api/v1/favorites; /api/v1/seller/services.
- **Schema:** sellerProfiles, sellerApplications, products, productVersions, productSkus, favorites.
- **Admin dependency:** app/admin/seller-review-drawer.tsx; app/admin/service-review-drawer.tsx.
- **Existing regression suites:** seller-product.integration.test.mjs; stage-2-domain.test.ts; stage-7-seller.test.ts.
- **Current gap:** Catalog and approvals exist; no game/category model or general-item stock/delivery contract; Home and seller navigation differ.
- **Related decisions:** D03, D04, D05, B08, B09.

### purchase

- **Milestone / action:** M1/M3/P3; Replace new-rule path; preserve legacy.
- **Owner role:** Backend transactions + mobile + payments.
- **Code:** apps/api/src/order-payment.controllers.ts; apps/api/src/order-payment.service.ts; apps/mobile/src/features/checkout/order-api.ts; apps/mobile/src/features/checkout/checkout-domain.ts.
- **API:** /api/v1/orders; /api/v1/payments; /callbacks/v1/payments.
- **Schema:** orders, orderSlotReservations, sellerAvailabilitySlots, payments, paymentEvents, idempotencyKeys.
- **Admin dependency:** Order/payment query and intervention in existing admin.
- **Existing regression suites:** order-payment.integration.test.mjs; stage-3-checkout.test.ts.
- **Current gap:** Current contract requires slot_id/service_starts_at and seller accept/reject. Test channels and legacy race coverage exist.
- **Related decisions:** B01, B07, D02, D04, D12, D16.

### fulfillment

- **Milestone / action:** M1/M3; Extend with new-rule commands.
- **Owner role:** Transactions backend + mobile + files.
- **Code:** apps/api/src/order-payment.service.ts; packages/application/src/order-jobs.ts; apps/mobile/src/features/seller/seller-order-api.ts; apps/api/src/file-storage.service.ts.
- **API:** /api/v1/seller/orders; /api/v1/orders; /api/v1/files.
- **Schema:** orders, orderStatusLogs, files, fileUsages, scheduledJobs.
- **Admin dependency:** Evidence retrieval and order governance.
- **Existing regression suites:** order-payment.integration.test.mjs; stage-3-checkout.test.ts; stage-7-seller.test.ts; file-upload.test.ts.
- **Current gap:** Current complete action takes version without fulfillment evidence payload; extension/cooldown/new evidence policy require implementation.
- **Related decisions:** B01, B02, D12, D13, D16.

### cases

- **Milestone / action:** M1/M4; Replace new-rule workflow; preserve legacy.
- **Owner role:** After-sales backend + mobile + support admin.
- **Code:** apps/api/src/after-sale.service.ts; apps/api/src/after-sale.controllers.ts; apps/mobile/src/features/after-sale/after-sale-api.ts; app/admin/support-workspace.tsx.
- **API:** /api/v1/refunds; /api/v1/seller/refunds; /api/v1/complaints; /admin-api/v1/refunds; /admin-api/v1/complaints.
- **Schema:** refunds, refundLogs, complaints, complaintEvidences, complaintLogs; target proposals/rulings/appeals/independent holds are missing.
- **Admin dependency:** Support/supervisor rulings, separated appeal review, controlled evidence.
- **Existing regression suites:** after-sale.integration.test.mjs; stage-4-after-sale.test.ts.
- **Current gap:** Legacy refunds/complaints exist; full case, proposal, supplementary, appeal and source-framework liability behavior is missing.
- **Related decisions:** B01, B02, D06, D12, D13, D16.

### finance

- **Milestone / action:** M1/M4/M5/P3; Extend.
- **Owner role:** Finance backend + finance operations + mobile.
- **Code:** packages/application/src/finance-ledger.ts; apps/api/src/finance.service.ts; apps/api/src/payout-provider.ts; apps/mobile/src/features/seller/seller-finance-api.ts.
- **API:** /api/v1/seller/finance; /api/v1/seller/payout-accounts; /api/v1/seller/withdrawals; /admin-api/v1/withdrawals.
- **Schema:** ledgerAccounts, ledgerTransactions, ledgerEntries, sellerIncomes, sellerLiabilities, withdrawals, withdrawalIncomeAllocations, reconciliationRuns.
- **Admin dependency:** Withdrawal approval, reconciliation, liability handling; independent case holds need model.
- **Existing regression suites:** finance.integration.test.mjs; stage-8-seller-finance.test.ts.
- **Current gap:** Ledger/payout/reconciliation exist. Refund commission is proportional today; V3.5 full waiver and independent holds need implementation.
- **Related decisions:** B01, B07, D10, D11, D16.

### reviews

- **Milestone / action:** M5; Extend.
- **Owner role:** After-sales backend + mobile + review operations.
- **Code:** apps/api/src/after-sale.service.ts; apps/mobile/src/features/after-sale/review-create-screen.tsx; apps/mobile/src/features/after-sale/review-detail-screen.tsx.
- **API:** /api/v1/reviews; /api/v1/products/:productId/reviews; /admin-api/v1/reviews.
- **Schema:** reviews, ratingAggregates, orders.
- **Admin dependency:** Review visibility/moderation; public seller replies unresolved.
- **Existing regression suites:** after-sale.integration.test.mjs; stage-4-after-sale.test.ts.
- **Current gap:** Review paths exist; first-termination window, refunded-order eligibility/labels and public replies need reconciliation.
- **Related decisions:** B01, B04, D09.

### messaging

- **Milestone / action:** M6/P2; Extend; replace production transport.
- **Owner role:** Messaging backend + mobile.
- **Code:** apps/api/src/chat-support-notification.service.ts; apps/mobile/src/features/chat/chat-transport.ts; apps/mobile/src/features/chat/chat-screen.tsx.
- **API:** /api/v1/conversations; /api/v1/notifications.
- **Schema:** conversations, conversationMembers, messages, notifications, deliveryLogs.
- **Admin dependency:** Moderation callbacks, archive evidence, reports/appeals.
- **Existing regression suites:** chat-support-notification.integration.test.mjs; stage-5-messaging.test.ts.
- **Current gap:** HTTP polling text path exists. Tencent integration, authorized product/order cards, role identity, archive and native push are not established.
- **Related decisions:** B02, B03, D07, D13.

### feedback

- **Milestone / action:** M6; Add.
- **Owner role:** Feedback backend + mobile + admin.
- **Code:** app/page.tsx; apps/api/src/chat-support-notification.service.ts (support reference only).
- **API:** No dedicated feedback API located; do not substitute /api/v1/support-cases.
- **Schema:** No dedicated feedback table located.
- **Admin dependency:** New dedicated handling and official-reply view required.
- **Existing regression suites:** No feedback-specific suite located; chat-support tests cover separate support.
- **Current gap:** Standalone records, history, reply workflow and notification are missing; feedback is not an after-sales case.
- **Related decisions:** D08.

### support

- **Milestone / action:** M4/M6; Extend.
- **Owner role:** Support backend + mobile + operations.
- **Code:** apps/api/src/chat-support-notification.service.ts; apps/mobile/src/features/chat/support-create-screen.tsx; app/admin/support-workspace.tsx.
- **API:** /api/v1/support-cases; /admin-api/v1/support-cases.
- **Schema:** supportCases, supportCaseLogs, conversations.
- **Admin dependency:** Existing support workspace; special-claim intake and timestamp evidence need new-rule acceptance.
- **Existing regression suites:** chat-support-notification.integration.test.mjs; stage-5-messaging.test.ts.
- **Current gap:** Support exists; preserve first qualifying contact, case linkage and restriction exceptions.
- **Related decisions:** B01, B02, D13.

### reliability

- **Milestone / action:** M1/M4/M7; Extend.
- **Owner role:** Application backend + worker/scheduler + QA.
- **Code:** packages/application/src/reliability.ts; packages/application/src/order-jobs.ts; apps/worker/src/main.ts; apps/scheduler/src/main.ts.
- **API:** Shared command/job paths behind transaction APIs.
- **Schema:** outboxEvents, inboxEvents, scheduledJobs, idempotencyKeys, orderStatusLogs.
- **Admin dependency:** Job/queue inspection, outage attribution, audit.
- **Existing regression suites:** packages/application/tests/reliability.test.mjs; packages/database/tests/migration-rollback.integration.test.mjs; order-payment.integration.test.mjs.
- **Current gap:** Durable primitives exist; worker currently uses LoggingPublisher; new-rule stale-job and outage behavior need implementation.
- **Related decisions:** B01, D16.

### files

- **Milestone / action:** M3/M4/P1/P2; Extend.
- **Owner role:** Files backend + mobile + privacy/security.
- **Code:** apps/api/src/file-storage.service.ts; apps/api/src/file-lifecycle.service.ts; apps/api/src/object-storage-provider.ts; apps/mobile/src/features/files/file-upload-api.ts.
- **API:** /api/v1/files; /api/v1/me/files; /admin-api/v1/files.
- **Schema:** files, fileUsages, complaintEvidences.
- **Admin dependency:** Original/redacted evidence access, moderation/quarantine, lifecycle holds.
- **Existing regression suites:** file-storage.integration.test.mjs (not executed in this batch); file-upload.test.ts; native-voice-media.test.ts.
- **Current gap:** Existing file foundation; completion evidence immutability/redaction, OSS adapter and retention conflict remain.
- **Related decisions:** B02, D13.

### quality

- **Milestone / action:** M7; Reuse and extend.
- **Owner role:** Mobile/web + QA.
- **Code:** apps/mobile/src/components/state-view.tsx; apps/mobile/src/query/remote-state.ts; apps/mobile/tests/stage-9-release.test.ts; app/page.tsx.
- **API:** All affected routes.
- **Schema:** No independent schema; consumer of current state/action contracts.
- **Admin dependency:** Cross-client consistency and manual device evidence.
- **Existing regression suites:** stage-9-release.test.ts; query-lifecycle-sync.test.ts; user-journey.e2e.test.mjs.
- **Current gap:** Static/domain checks pass separately from native UI proof; real-device and web behavior remain unverified in M0.
- **Related decisions:** D15.

## Page coverage

All 35 PRD page/component IDs are mapped. Native paths below are relative to `apps/mobile/app/`; references to missing screens identify new work. The separate web implementation uses `app/page.tsx` screen dispatch and has not been accepted against V3.5.

| ID | Page/component | Native implementation or missing target | Owner group |
| --- | --- | --- | --- |
| PG-U01 | Sign-in, registration, initial profile | (auth)/login.tsx; (auth)/profile-setup.tsx | account |
| PG-U02 | Identity verification and result | settings/identity.tsx | account |
| PG-U03 | Agreements and Rules Center | rules.tsx; policies/[id].tsx; settings/policy-acceptances.tsx | account |
| PG-U04 | Profile and Account Security | settings/index.tsx; settings/profile.tsx; settings/security.tsx; settings/phone-change.tsx; settings/data-export.tsx; settings/account-cancellation.tsx | account |
| PG-B01 | Buyer Home | (buyer-tabs)/index.tsx | catalog |
| PG-B02 | Search, results, category lists | search.tsx | catalog |
| PG-B03 | Store/companion profile and review list | companions/[id].tsx; companions/[id]/reviews.tsx | catalog |
| PG-B04 | Product Details | services/[id].tsx | catalog |
| PG-B05 | Variant-selection bottom sheet | No dedicated target bottom-sheet component verified; existing service detail and checkout/schedule.tsx differ | purchase |
| PG-B06 | Confirm Order | checkout/confirm.tsx | purchase |
| PG-B07 | Checkout and payment result | orders/[id]/pay.tsx; payments/[id]/processing.tsx; payments/[id]/result.tsx | purchase |
| PG-O01 | Buyer and seller order lists | (buyer-tabs)/orders.tsx; (seller-tabs)/orders.tsx | purchase |
| PG-O02 | Buyer and seller order details | orders/[id].tsx; seller/orders/[id].tsx | fulfillment |
| PG-O03 | View or submit fulfillment evidence | No dedicated fulfillment-evidence route located; existing file components are reusable | files |
| PG-A01 | Create or edit after-sales request | refunds/new.tsx; edit/reapplication target is missing | cases |
| PG-A02 | After-sales details and seller handling | refunds/[id].tsx; seller/refunds/[id].tsx (legacy) | cases |
| PG-A03 | Submit or respond to a proposal | No proposal screen/route located | cases |
| PG-A04 | Platform handling, evidence, appeals | complaints/new.tsx; complaints/[id].tsx (legacy, not full appeal handling) | cases |
| PG-A05 | Ruling and review result | No ruling/review-result route located | cases |
| PG-A06 | Refund Progress | refunds/[id].tsx (legacy) | cases |
| PG-B08 | Submit or view own review | reviews/new.tsx; reviews/[id].tsx | reviews |
| PG-B09 | Buyer My Account, Favorites, coupon placeholder | (buyer-tabs)/mine.tsx; favorites.tsx; coupons.tsx | account |
| PG-M01 | Buyer and seller message lists | (buyer-tabs)/messages.tsx; seller Messages tab missing | messaging |
| PG-M02 | Chat Conversation | conversations/[id].tsx | messaging |
| PG-M03 | Product or order picker | No product/order picker route located | messaging |
| PG-N01 | Official Notices and notification details | notifications/index.tsx; notifications/[id].tsx | messaging |
| PG-C01 | Platform Support and tickets | support/index.tsx; support/new.tsx; support/[id].tsx | support |
| PG-FDB01 | Feedback, My Feedback, Feedback Details | No standalone feedback route located | feedback |
| PG-S01 | Seller application and review result | seller/apply.tsx; seller/status.tsx | catalog |
| PG-S02 | Seller Home | (seller-tabs)/index.tsx | catalog |
| PG-S03 | Product Management | (seller-tabs)/services.tsx (navigation changes required) | catalog |
| PG-S04 | Publish/edit product and review result | seller/services/new.tsx; seller/services/[id]/edit.tsx; seller/services/[id]/review.tsx | catalog |
| PG-S05 | Seller My Account and business statistics | (seller-tabs)/earnings.tsx; seller/profile.tsx (target seller My Account missing) | finance |
| PG-S06 | Earnings, settlement, frozen-funds details | seller/finance/incomes.tsx | finance |
| PG-S07 | Withdrawals, history, payout accounts | seller/finance/withdraw.tsx; seller/finance/withdrawals/index.tsx; seller/finance/withdrawals/[id].tsx; seller/finance/accounts.tsx | finance |

## Requirement section coverage

All 23 PRD sections map to an implementation group. Cross-cutting requirements apply to every affected group; this map is an index, not a waiver of nested requirements. Exact page and AC text is preserved in the companion JSON.

| Section | Requirement area | Primary group |
| --- | --- | --- |
| 1 | 1 How to Use This Document | account |
| 2 | 2 Product Positioning Roles and Scope | catalog |
| 3 | 3 Page Structure and Navigation | quality |
| 4 | 4 Shared Account Requirements U-01 to U-05 | account |
| 5 | 5 Buyer Home Search and Products B-01 to B-05 | catalog |
| 6 | 6 Variants Order Creation and Payment BUY-01 to BUY-04 | purchase |
| 7 | 7 Order After-Sales Review and Funds State Model | reliability |
| 8 | 8 Buyer Order Cards and Complete Action Matrix ORD-B | purchase |
| 9 | 9 Seller Onboarding Home and Products SELL-01 to SELL-04 | catalog |
| 10 | 10 Seller Order Cards and Action Matrix ORD-S | fulfillment |
| 11 | 11 After-Sales Forms Negotiation Intervention and Special Appeals AFT-01 to AFT-08 | cases |
| 12 | 12 Shared Button Contracts and Confirmation Copy ACT | reliability |
| 13 | 13 Timers Pauses Restoration and Notifications TIME | reliability |
| 14 | 14 Messages Send Product and Send Order MSG-01 to MSG-04 | messaging |
| 15 | 15 Standalone Feedback Notices and Support FDB NOTICE CS | feedback |
| 16 | 16 Reviews Funds Withdrawals and Business Statistics FIN REV | finance |
| 17 | 17 Data Objects and API Contracts DATA API | reliability |
| 18 | 18 Errors Uploads Navigation and Visual Quality QA | quality |
| 19 | 19 Server Consistency Security and Job Requirements SRV | reliability |
| 20 | 20 Implementation Gaps and Development Order | quality |
| 21 | 21 Acceptance Cases AC | quality |
| 22 | 22 Pending Decisions and Blocked Scope D | quality |
| 23 | 23 Definition of Implementation Completion and Launch Acceptance | quality |

## Acceptance backlog

All 64 cases are currently **V3.5 not verified**. Each row links through the owner group above to code, routes, schemas, administration, existing tests, milestone, and decisions. The expected outcomes are copied from the supplied PRD; no new-rule pass is inferred from legacy tests.

| ID | Source scenario | Required outcome | Group |
| --- | --- | --- | --- |
| AC01 | Buyer opens Recommended Home | Five shortcuts in one row/order; Platform Rules and Feedback labels; no Lucky Wheel/leaderboard | catalog |
| AC02 | Change Companions/Services, game, sort; open details and return | Filters/sorts affect real results; restore conditions/position | catalog |
| AC03 | Fewer than four products or load failure | Distinguish actual count, empty, and failure; no sample filler | catalog |
| AC04 | Guest attempts favorite/feedback/order, then signs in | Return to authorized task; no automatic submission/payment | account |
| AC05 | Unverified or underage user attempts order/seller application | Server blocks; local approval text cannot grant access | account |
| AC06 | Approved buyer switches to seller and back | Both bars Home/Orders/Messages/My Account; correct ownership/permissions | account |
| AC07 | Seller views Home and My Account | No withdrawable balance on Home; funds/statistics separate in My Account | catalog |
| AC08 | Direct purchase/relist call for unapproved/platform-delisted product | Server rejects; existing-order snapshots remain accessible | catalog |
| AC09 | Buy Now, select variants/quantity, close/reopen | Bottom sheet; no order on close; preserve/revalidate choices | purchase |
| AC10 | Server price changes during order creation | Display old/new prices and require confirmation before higher charge | purchase |
| AC11 | Double-submit order/repeat payment callback | One effective order/payment; consistent state/amount | purchase |
| AC12 | Payment returns but channel outcome unknown | Query original, show confirmation pending; not automatically paid/failed | purchase |
| AC13 | Cancellation/payment race or late funds after closure | Backend resolves and tracks real funds; never ignore received money | purchase |
| AC14 | Seller tries immediate completion after payment, then normal start | Direct completion rejected; start gives T02 without deadline reset/buyer reconfirmation | fulfillment |
| AC15 | Four images; RMB 199.99 with five; RMB 200 with five but no recording | Four fail; 199.99 meets count threshold; 200 requires recording | fulfillment |
| AC16 | Completion upload partially fails | Retain draft/uploaded references; still In Service; no 72-hour clock | fulfillment |
| AC17 | Tap image/amount/blank area, store, action, More | Body opens details, store opens store, child actions independent; no redundant detail button | purchase |
| AC18 | Same order in All and a status list | Identical state/deadline/actions; filter label does not manufacture actions | purchase |
| AC19 | More than three valid actions or no additional actions | At most three direct buttons; overflow in More; no empty menu/duplicates | purchase |
| AC20 | Remind in T01/T02 immediately after success and after 24 hours | No repeat notice during cooldown; correct next time; success only after interval | fulfillment |
| AC21 | Ordinary request from T01/T02/T03 | Eligible entry in each; S01 whole-order freeze and paused normal actions | cases |
| AC22 | Confirmation and ordinary after-sales submitted together | Only first valid transition commits; refresh loser, no duplicate settlement/overwrite | cases |
| AC23 | Ordinary extension used, then attempt in R02 | Only one successful 24-hour extension per order; no reset | fulfillment |
| AC24 | Withdraw request with original 60/two hours left, or undelivered stage | Delivered restores 60/24 hours; undelivered returns T01/T02 without acceptance clock | cases |
| AC25 | Third edit or edit/withdraw after intervention | Block; first two edits reset S01 to 24 hours and invalidate old proposal/jobs | cases |
| AC26 | Reapply after three self-service cases ended | No further self-service creation; support verification for new issues remains | cases |
| AC27 | S01 seller only chats/adds evidence for 24 hours; nobody intervenes | Not effective response; deem requested amount agreed; Pending Execution before dispatch | cases |
| AC28 | Intervention races with timeout agreement; both parties intervene | One legal outcome/case, no duplicate freeze/refund | cases |
| AC29 | First rejection/silence; second-wait expiry or second rejection | First to S05; second/wait expiry to P01; silence never acceptance/automatic full refund | cases |
| AC30 | S03 intervention within 48 hours or unattended expiry | Intervention stops closure; unattended expiry restores stage, not automatic sale completion | cases |
| AC31 | Open card before accepting refund/supplementary proposal | Read full proposal; no automatic acceptance; reject stale-version action | cases |
| AC32 | Accept supplementary proposal then miss deadline | Original freeze persists; overdue to P01, not automatic full refund | cases |
| AC33 | Confirm/append/unused extension in R02 with original case open | Allowed; renewed dispute blocks confirmation, not blanket blocking for original case | cases |
| AC34 | R02 buyer disputes or seller intervenes; platform denies refund | Original case P01, no new-case/round reset; restore R02/freeze and max(remaining,24h) | cases |
| AC35 | P01 mediation after seller used two pre-intervention rounds | Valid proposal still permitted, 24-hour validity, review SLA continues | cases |
| AC36 | Missing evidence at deadline; second supervisor extension at same level | Decide on available materials within 24 hours; reject second extension | cases |
| AC37 | One party accepts ruling, other validly appeals | No early execution; cancel old execution; keep freeze | cases |
| AC38 | Both accept current same-version ruling, or accept old version | Execute current version once with no appeal; reject stale version and refresh | cases |
| AC39 | Second appeal without new evidence or appeal after final ruling | Block second without new evidence; no third internal appeal | cases |
| AC40 | Effective refund not dispatched or dispatched without success receipt | Pending Execution/Refund Processing respectively; neither claims funds received | finance |
| AC41 | Refund timeout, retry, duplicate success callback | Query original; refund/ledger once only, no over-refund | finance |
| AC42 | RMB 100 refunds of 60, 0.01, or full; duplicate-payment correction | Commission zero, income 40/99.99/0; correction does not waive valid-order commission | finance |
| AC43 | Confirm without reviewing, seven-day expiry, review after full refund | Settlement independent; no automatic positive review; full refund stays Refunded | reviews |
| AC44 | Serious issue reported on day 6; staff starts review on day 8 | Use valid day 6 contact; delayed intake does not lose eligibility | cases |
| AC45 | Special case denied or later additional refund | Preserve transaction/review deadline; no return to acceptance/new seven-day window | cases |
| AC46 | Insufficient funds or recovery and advance arrive together | Genuine Pending Execution/progress; no false receipt or duplicate compensation | finance |
| AC47 | Ordinary-case release with independent risk freeze | Release only case freeze; risk funds still unavailable | finance |
| AC48 | Withdrawal races with freeze or channel outcome unknown | Atomic reservation checks; query original, no duplicate payout/incorrect release | finance |
| AC49 | Both message lists and plus panel | No fixed notification/support rows; Product and Order available | messaging |
| AC50 | Buyer sends current-store product or seller sends own product | Explicit send gives both parties card; correct product details; no order creation | messaging |
| AC51 | Send shared order; substitute third-party order ID | Authorized card opens viewer-role details; unauthorized send/read fails | messaging |
| AC52 | Delist product/change order after sending; weak-network resend | Retain history, read current state, one message only | messaging |
| AC53 | Tap Home Feedback | Independent official-message page; no support redirect/conversation/empty ticket | feedback |
| AC54 | Blank message/missing type/valid submission/rapid repeated taps | Required fields enforced; persist ID/time; repeated request gives one record | feedback |
| AC55 | Feedback fails or result unknown, then retry | Retain input/query original; no false success/duplicate record | feedback |
| AC56 | My Feedback and substituted other-user feedback ID | Own history/details available; other user's content/replies inaccessible | feedback |
| AC57 | Staff replies to feedback | Replied with text/time; one notice opens details; not automatically Adopted | feedback |
| AC58 | Feedback text requests a refund | No after-sales case/freeze/paused deadline; order-help guidance remains | feedback |
| AC59 | Four-game category-specific checkout and item-only store | Correct fields, no mandatory voice/rank or physical address | catalog |
| AC60 | Old/new rule orders; exit and reopen client | Each keeps snapshot; persisted state/counts/deadlines do not reset | reliability |
| AC61 | Cross-day payment/refund and statistics spanning pages | Same Home/My Account definition; full-data reconciliation; errors not zero | finance |
| AC62 | Deadline occurs during downtime preventing action | Record/extend by impact duration, reschedule, no erroneous closure | reliability |
| AC63 | Nonparticipant requests evidence/unredacted original | Reject unauthorized access; counterparties receive authorized redacted information | files |
| AC64 | Long titles/amounts, 375/390/430 widths, keyboard, Back | Main information/actions visible, no horizontal overflow, source restored | quality |

## Remaining entry gates

1. **Framework V3.1:** Provide the original file/path; its J liability and K test rules are required by PRD V3.5 and M1. A path/link request is pending in this chat.
2. **B01–B10 and D01–D16:** The implementation plan remains the decision register. User authorization to begin implementation is recorded; unresolved business-policy choices are not silently treated as resolved. Role owners are mapped above; named accountable owners have not been supplied.
3. **Historical data:** Local data inventory is complete. Staging/production inventory and treatment of historical orders remain unverified; the empty local database does not authorize removing version compatibility.
4. **Release/device scope:** D15 and user-started device evidence remain open. No native or web product completion is claimed.
5. **Provider work:** Real identity/payment eligibility, SDK behavior, retention choices, and company-owned provider access remain external prerequisites; mock success is only internal regression evidence.

**Next sequential implementation milestone:** Begin the confirmed M1 compatibility foundation independently of missing liability rules. Framework V3.1 and the applicable effective-rule/history decisions remain required before finalizing and activating the new transaction model. Do not activate full-commission-waiver behavior on legacy orders as a shortcut.

## Final verification update

Mobile regression after repair: 179 passed, 0 failed, 0 skipped; mobile type check and lint passed. Contract/application baseline: 9 passed; focused integration baseline: 49 passed, with no failures or skipped tests. All 21 pre-existing changed/untracked paths matched their initial fingerprints before the intentional implementation-plan progress update. No application migration was applied during M0. Later M1 verification is recorded separately in the implementation plan.
