# Sammy prototype: fresh requirements and implementation review

> Implementation follow-up: see [30 October feature-gap implementation](2026-10-30-feature-gap-implementation.md) for completed changes and current verification. This document preserves the original pre-change audit.

Date: 29 October 2026. Scope: **prototypes/sammy only**, including the current uncommitted chat changes. This review supersedes the implementation-status conclusions in the 19 October audit. It does not count functionality in the company root app or other prototypes.

## Conclusion

This is now a connected **one-game marketplace prototype with simulated financial transactions**, not just a UI mock. Authentication, provider applications, listings, persisted orders, fulfillment/after-sales, a ledger, support, and basic chat exist across mobile/backend/admin.

It is **not yet a complete implementation of the supplied PRD**, nor a public-launch-ready MVP. Some missing items are ordinary product workflows that can be completed without buying services; others are intentionally deferred real-provider integrations. No defensible percentage is assigned because the documents do not establish one consistent approved MVP denominator.

## Sources and decisions

Freshly extracted and compared:

- `Xiongzai-User-App-PRD-V3.5-English.docx`: product flows, sections 4–18, AC01–AC64, D01–D16.
- `Xiongzai Esports MVP to Full Product Development Plan.pdf`: stages and launch gates, especially pages 4–8 and 11–13. This is a delivery roadmap, not a frozen feature checklist.
- `Xiongzai-Esports-Platform-Business-Overview-V2.1-English.docx`.
- `XIONGZAI_Business_Model_Culture_Launch_Plan_V4.1_EN.pdf` and `Xiongzai_Business_Model_English_Translation_V4.1.pdf`.
- `Xiongzai-Esports-Third-Party-Service-Checklist-Simple-V1.7.xlsx`: service requirements and integration acceptance.

All six source files are in `/Users/codecrafterx/Desktop/Xiongzai docs/`.

Current user decisions override document alternatives: separate Sammy project; Fastify/Zod backend on Heroku, Neon database, Cloudinary media; phone/password for now; simulated payments/refunds/payouts; WeChat Pay when real payments are integrated; company bears channel fees. English/Chinese customer copy and complete usable forms are required.

Document conflicts are material:

1. The business blueprint starts Phase 1 with Peace Elite; PRD §2.1 describes four games and multiple service/item categories. Current code matches the narrower game slice, not the whole PRD. A one-game test must be recorded as an explicit release slice, not described as four-game completion.
2. Older roadmap/business language includes availability, appointments, and seller acceptance. PRD §2.3 explicitly excludes scheduling and accept/reject-order steps. Do not add these automatically.
3. The October service checklist specifies both payment channels, OSS, Tencent Chat/push, and richer chat media; current user choices allow WeChat-only and Neon/Cloudinary/basic chat for this prototype. Do not buy or migrate providers merely to satisfy an older checklist. Production provider choices still need reconciliation.
4. PRD §11.8 requires three-year evidence/message retention; the checklist specifies 180-day IM evidence retention. Neither a storage account nor default provider history constitutes an implemented retention policy.
5. Original Transaction and After-Sales Framework V3.1 remains unavailable in the supplied folder. The PRD repeats many rules, but full J/K-rule conformance cannot be certified from that alone. This does not block the clear product work below.

## Implementation matrix

“Implemented” here means a source-backed path exists, not that every acceptance scenario has passed on devices.

| Area / requirement | Current implementation | Still needed |
|---|---|---|
| Bilingual shell, onboarding | English/Chinese, language persistence, player/provider signup paths, mascot/branding, Home/Orders/Messages/Me | Full small-screen, keyboard, accessibility, Android and real-device acceptance; seller-specific operating view |
| Account access — U-01 | Phone/password, hashed passwords and sessions, rate limits, SecureStore, sign-out | Password recovery/change, verified phone ownership/rebinding; real SMS intentionally deferred |
| Identity/age — U-02 | No verified identity/age subsystem | Server-owned pending/approved/rejected verification, first-order adult gate and seller verification; no false verification claims |
| Restrictions/account rights — U-03/04 | User/provider restrictions and authorized access to existing order assistance; avatar/name/bio editing | Separate penalty appeals, phone rebinding, export, closure with outstanding-case/debt/retention checks |
| Agreements/rules — U-05 | Submission consent and immutable order rule snapshots; legacy-copy presentation helper | Public Platform Rules center, official versions/publication/effective dates, versioned account/seller acceptance records |
| Home/discovery — §5.1/2 | Real listing API, title/description search, relaxed/ranked and duo/squad filters, pagination/detail | Recommended/Companions/Services structure; five shortcuts; announcements; actual best sellers/popular companions; store/game search and configured sorting |
| Stores/favorites — §5.3 | Provider information embedded in listing detail | Dedicated store/companion page with products/reviews/contact; personal product/store favorites and unavailable-item handling |
| Catalog — §5.4/6 | Peace Elite hourly duo/squad listings, descriptions/photos/prices, quantity sheet, server quote validation and snapshots | Other three games if included in the release; permitted category templates, proper SKUs/units/capacity, fulfillment promises and category-specific delivery fields |
| Provider onboarding — §9.1 | Saved drafts, avatar/voice, submitted immutable snapshot, admin approval/changes request and resubmission | Genuine rejected/restricted lifecycle, identity/adult/payout prerequisites and item-only seller path; formal edit/reapproval policy |
| Product approval — §9.3 | Provider approval gates self-publication; admin can block/restore services | **Separate product submission/review/approval** before publication, rejection reasons, resubmission and version-safe reapproval |
| Checkout/payment — §6 | Persistent direct order, quote conflict detection, ownership/eligibility checks, idempotency, pending/failure/success simulation, cancel | Approved SKU/category details and explicit price-change recovery; real WeChat integration/late results/reconciliation later; identity gate missing |
| Fulfillment — §7/10 | Start, five-image completion, recording threshold, append evidence, 72-hour acceptance and one 24-hour extension | Payment-relative fulfillment deadlines and mutually accepted changes; buyer reminders/cooldown; special-request agreement records; seven-day review state; complete order-card actions |
| After-sales — §11/12 | Ordinary requests, edits/withdrawal, proposals, intervention, supplementary fulfillment, two appeals, ruling/refund simulation, holds and durable job records | Complete admin evidence/redaction UI; source-framework conformance; shortage recovery/advance/progress workflows; outage-impact extensions; full native acceptance |
| Reviews — §16.1 | No customer-review model/API/UI found | One genuine review per eligible order, seven-day window, full-refund eligibility, moderation and actual rating aggregates; no automatic positive reviews |
| Chat — §14 | Private persisted text, listing/order entry points, foreground polling, preview/unread inbox, idempotent retry, basic order/product references | Rich historical card snapshots, current order-state rendering, complete navigation from every entry, search/pagination in pickers, PRD plus panel, avatar, durable draft/reconnect behavior; push separate |
| Notices/support/feedback — §15 | Persisted notices, authorized links, separate support/feedback classification, own history, staff replies | Standalone Feedback and Official Notices Home entry/pages; human-readable localized event summaries; server-side type filtering; decouple nonfinancial support writes from simulation switch |
| Seller operations — §9/16.4 | Seller order list, provider/listing management, funds view | Separate seller home/queues, consistent whole-account counters, period-based turnover/refund/earnings statistics using agreed Beijing-time definitions |
| Funds — §16.2/3 | Integer-fen ledger, commission/refund adjustments, unsettled/available/frozen/reserved balances, simulated withdrawals and admin outcomes | Same-name verified destinations, real payout results/reconciliation, shortage/recovery/advance tracking and agreed limits; not a real-money-ready service |
| Admin | Users, providers, applications, services, orders, cases, funds/withdrawals, tickets, jobs, audit history | Product-review queue, evidence viewing/redaction, support-intake action coverage, reviews, granular staff roles/MFA, complete financial reporting and audit metadata |
| Storage | Cloudinary adapter, private signed media capabilities, validated immutable files, avatar/voice/evidence support | Retention/legal-hold/deletion lifecycle, content moderation/quarantine/scanning policy, recovery verification and production provider reconciliation |
| Hosting/jobs/release | Heroku is the confirmed backend host. Node entry point supports DYNO/PORT; Neon integration/migrations and an in-process durable-job runner exist. Legacy Vercel configuration remains in source. | Verify Heroku build/start setup, explicit hosted simulation configuration, reliable job execution through dyno restarts/sleep, environment isolation, monitoring/alerts, backup restoration and hosted device testing |

## Concrete defects/incomplete paths to address first

### 1. Me counters do not reflect the connected data model

`mobile/src/features/marketplace/AccountScreens.tsx:153` counts “To play” using the base `awaitingService` status, which remains on paid orders while their fulfillment state advances. After-sales counts use `order.refund`, although hosted orders use `activeCaseId`. The message badge uses `market.conversations`, which the hosted adapter returns as an empty array (`useHostedMarketplace.ts`). Counts also cover loaded orders, not reliable full-account aggregates.

**Acceptance:** profile badges, buyer/seller queues and inbox agree with server aggregates after actions, account switches and reloads; failed queries are not shown as zero.

### 2. Staff cannot inspect transaction evidence in the current admin UI

`backend/src/commerce.ts:23` deliberately returns evidence metadata with `url:null`; an authenticated audited endpoint supplies access. `backend/public/admin.js:20` skips every file without a URL instead of requesting that endpoint. The redaction API exists but has no connected staff upload/review flow.

**Acceptance:** authorized staff can view original evidence through audited access, upload/link a reviewed redacted copy, and the counterparty can view only that copy. Never solve this by making originals public.

### 3. Product approval is missing, despite provider approval existing

`backend/src/listings.ts:60` publishes on provider approval and consent. There is no independent product approval state. Admin block/restore after publication is not PRD AC08 product approval.

**Acceptance:** a product cannot be published or bought until its submitted version is approved; edits, rejection, resubmission and moderation preserve historical orders.

### 4. Heroku simulation and job execution need deployment verification

Correction: the backend target is **Heroku**, not Vercel. `backend/src/local.ts` already binds to `0.0.0.0` when `DYNO` is present and reads `PORT`. Its 30-second job loop can run in a Heroku process; a Vercel scheduler is not required. However, the loop starts only when `simulationAvailable()` is true, and `backend/src/orders.ts:11` rejects non-Vercel execution with `NODE_ENV=production`. A production-mode Heroku deployment therefore needs an explicit, isolated test-mode policy for simulated transactions and their jobs, rather than disabling production safeguards globally. Verify the actual build/start configuration and dyno lifecycle. Persisted jobs allow catch-up, but sleeping or stopped dynos do not execute them on time. A continuously running process, dedicated worker, or suitable scheduler should be selected based on the deployed plan and deadline needs; a separate worker is not automatically required. Live Heroku configuration was not inspected in this review.

**Acceptance:** a deadline expires correctly without an open app or local terminal; retries/restarts execute once; stale jobs cannot override newer decisions. PRD AC62 additionally needs a controlled outage-impact policy, not merely catching up expired jobs.

### 5. Chat is usable but not complete against the PRD

`backend/src/commerce-schema.ts` stores a text body/object ID, not the rich public card snapshot specified in §14. `HostedChat.tsx` renders title text and a link, not the required price/image/unit or order number/quantity/paid/refunded/status data. `CommerceScreens.tsx:32` opens order chat without navigation callbacks, so card links are disabled there. The product-send endpoint checks owner but does not revalidate published/moderation eligibility at send time (`commerce.ts:76`). Pickers fetch only their first page and lack search. Inbox is capped at 100 conversations without a continuation UI. Retry keys/drafts are in component memory, not a durable outbox.

**Acceptance:** both parties see the required card data, authorized links work from all entry points, delisted products retain history but cannot be newly sent as available, and interrupted sends/re-entry do not lose or duplicate messages. Polling is a valid prototype transport choice; it is not offline push.

### 6. Order presentation still flattens distinct states

`OrderScreens.tsx:67` treats any active case as After-Sales, including supplementary acceptance (R02). `hostedOrders.ts` drops detailed case/deadline information and sets `deadlineAt:null`. Status filtering/search applies to loaded pages. No Awaiting Review state exists. The UI does not yet match all PRD state/action/click-area rules.

**Acceptance:** R02 shows supplementary acceptance and permitted actions, refund processing/failure remains distinguishable, all records are findable, and list/detail/counts share the same server state.

### 7. Notifications and assistance still need customer-facing integration

`commerce-actions.ts` stores summaries such as `requestRefund · S01`; the mobile notice list renders them directly. `commerce.ts:82–86` still gates support/feedback writes on the payment-simulation flag. Feedback is reached as a tab in a combined hub, not the required independent Home page. Ticket pagination occurs before the mobile support/feedback filter, so a page can look empty while matching records exist later. Admin action definitions also omit `supportOpen`, although the backend exposes it.

**Acceptance:** localized meaningful events, dedicated feedback/notices navigation, independent nonfinancial assistance, correct filtered history, and staff can act on support intake without manual API calls.

## Proposed implementation order

These are review recommendations, not an instruction to buy services or activate real transactions.

1. **Connected-flow correctness:** repair counters/state presentation; finish staff evidence/redaction and support intake; finish chat card data/navigation/eligibility; decouple support/feedback from financial simulation. Verify buyer ↔ seller ↔ admin with two accounts.
2. **Complete the one-game marketplace journey:** product review, dedicated provider/store page, genuine reviews, favorites, and seller queues. Keep all financial effects simulated.
3. **Match required navigation:** Recommended/Companions/Services; five shortcuts in one row; standalone Feedback, Official Notices and Platform Rules. Quick Match/Coupons remain clearly unavailable placeholders. No invented rankings or sample sales.
4. **Make the remote prototype reliable:** Heroku build/start setup, explicit test-mode configuration and reliable job execution, independent test environment/configuration, real-user data handling, account recovery route, monitoring and recovery checks; then a hosted iOS/Android walkthrough. Backend/frontend builds alone do not satisfy this gate.
5. **Resolve and implement release breadth:** decide whether this test remains Peace Elite-only or covers the PRD's four games/categories; then implement explicit category/SKU/delivery templates. Freeze review/statistics/retention and verification policies before declaring those complete.
6. **Real-money/public launch later:** approved identity/SMS/payment/refund/payout integrations, channel reconciliation, production moderation/push as required, official policies, filing/store distribution and controlled real-channel pilot.

For a no-charge invited test, phone/password and simulated money remain accepted substitutions. They are not evidence that identity verification, phone ownership, production recovery, or financial integrations are complete. The prototype can exercise workflows without claiming those guarantees.

## Out of scope unless separately approved

Do not add appointment scheduling, seller accept/reject-order steps, a shopping cart, buyer stored-value wallet, Lucky Wheel, leaderboard, group buying, referrals, voice rooms or livestreams. Actual Quick Match/coupon operations are not required now. Additional chat image/voice scope conflicts between documents and must not be silently inferred from a sample UI.

## Evidence and verification limits

- Fresh review: source/schema/routes/mobile/admin/config and all six supplied documents. No product code was modified during this review.
- The immediately preceding chat implementation ran **42/42 mobile tests**, **15/15 isolated PostgreSQL integration tests**, mobile typecheck and backend build successfully. Those results apply to this unchanged product-code state; they are not a new execution of all PRD acceptance cases.
- The 25 October connected QA report documents earlier iOS/admin/Neon/Cloudinary checks. Those remain historical evidence, not fresh device or cloud checks for this audit.
- No fresh native, Android, hosted deployment, live Cloudinary/Neon, payment-channel, backup-restoration, load or security penetration test was performed here.
- AC01–AC64 and original K01–K37 do not have a complete release acceptance record. Clear missing acceptance areas include AC01/02 (Home/search), AC05 (identity), AC08 (product review), AC20 (reminder), AC43 (reviews), AC53 (standalone feedback), AC59 (category breadth), AC61 (statistics), AC62 (outage impact). AC49–52 remain partial even after basic chat improvements.
- Do not count passing domain tests as complete UI/provider coverage. Do not label unavailable integrations “done” because an adapter or simulation control exists.
