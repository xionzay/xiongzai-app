# Xiongzai implementation review

Review date: 23 October 2026. Scope: current working tree, including uncommitted changes, main API, database, admin dashboard and native app. This review changes no product code.

## Assessment

There is a substantial implemented foundation for the older appointment-based companionship platform. The newer four-game services and virtual-goods marketplace is only partially implemented. The remaining work includes core transaction and financial behavior, not merely interface polish or hosting configuration.

The service-category work added in this conversation is reusable and lives in the shared application code. It does not complete the newer catalog or transaction model. No production deployment or live-provider acceptance is established.

## Requirement sources and limits

- [Business Overview V2.1](</Users/codecrafterx/Desktop/Xiongzai docs/Xiongzai-Esports-Platform-Business-Overview-V2.1-English.docx>), dated 28 September 2026: business scope, stores, catalog, direct purchase, commission and conditional rentals.
- [User App PRD V3.5](</Users/codecrafterx/Desktop/Xiongzai docs/Xiongzai-User-App-PRD-V3.5-English.docx>), dated 29 September 2026: user journeys, transaction requirements, AC01–AC64, unresolved decisions D01–D16. This is a development review draft, not evidence of public rule approval.
- [Third-Party Service Checklist V1.7](</Users/codecrafterx/Desktop/Xiongzai docs/Xiongzai-Esports-Third-Party-Service-Checklist-Simple-V1.7.xlsx>), dated 2 October 2026: external services and their acceptance conditions. Its platform-feature rows contain older acceptance/companionship assumptions and are not completion evidence.
- Existing [implementation plan](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/docs/superpowers/plans/2026-10-05-xiongzai-marketplace-implementation.md) and [M0 audit](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/docs/superpowers/plans/2026-10-06-xiongzai-m0-audit.md) provide traceability and historical evidence. Current code was inspected rather than treating these reports as proof of current completion.

The separate Transaction and After-Sales Framework V3.1 was not found among the shared files. The PRD repeats many requirements, but its references to J01–J20 liability rules and K01–K37 acceptance cases cannot be independently certified without that source. This blocks final transaction sign-off, not all ongoing implementation.

The target games are Game for Peace/Peacekeeper Elite, Delta Force, Honor of Kings and VALORANT. Permitted services and virtual goods include companionship, coaching, permitted boosting, currency/items, redemption codes and lawful top-ups. Account sales and physical goods are excluded. Rentals remain conditional on per-game permission, access recovery and separate rules.

## What exists and what remains

“Implemented foundation” means persisted code and connected application paths exist. It does not mean the complete V3.5 requirement has passed device or production acceptance.

| Area | Implemented foundation | Remaining requirement or mismatch |
| --- | --- | --- |
| Accounts and privacy | SMS-code flow, sessions, profile/privacy settings, policy versions and acceptance records; phone change, data export and account cancellation workflows | Live SMS and identity verification; enforce verified-adult eligibility before purchase; confirm retention and account-restriction behavior |
| Seller onboarding | Separate seller profile, application snapshots, identity-status check, review/supplement/rejection and governance | Current submission requires rank, KD, play preferences and voice. Item-only stores must not require these. Verified adulthood, same-name receiving-account onboarding and one-store-per-verified-person acceptance remain |
| Catalog and approvals | Products, images, priced variants, submission/review, listing/delisting, favorites and discovery | Explicit four-game model/filtering, goods-specific fields, stock reservations, payment-relative delivery deadlines and category-specific checkout |
| Recent category feature | Admin category create/edit/disable, required public text fields, seller forms, package units, review/order snapshots, authorization/audit and additive migration | Text attributes are not inventory or fulfillment rules. Duration remains mandatory and units are session/match/hour. No game/stock/delivery model is supplied by this addition |
| Product edits | Version checks and controlled editing/reapproval paths | Listed SKUs cannot receive price-only edits directly. The overview permits immediate price/stock changes and pauses content/options edits for review; final publication policy needs alignment |
| Orders and payment | Persistent orders/payments, snapshots, idempotency, row locking, amount checks, callbacks, payment querying and legacy jobs | Checkout requires an appointment slot and start time. Paid orders require seller acceptance. New direct-purchase handlers are absent |
| Delivery and acceptance | Seller start/complete, buyer confirmation and configured auto-confirm job | No mandatory five-screenshot completion payload or recording threshold at ¥200. Missing complete payment-based deadline, one-time extension, pause/resume and supplementary-delivery behavior |
| After-sales | Refund requests, seller decisions, escalation, admin decisions, complaints, evidence and audit history | Full versioned proposal/ruling/appeal flow, edit/application limits, two appeal levels, supplementary fulfillment, separate ordinary/special/risk holds and exact deadline rules |
| Ledger and withdrawals | Integer-money accounting, commission/income entries, pending/available/locked funds, withdrawal allocations, payout records and seller liabilities | Partial refunds use the old proportional commission reversal. New rules require full commission waiver after any successful valid-order refund. Live settlement/reversal/payout reconciliation and independent holds remain |
| Reviews | Persisted buyer reviews, public ratings, moderation and duplicate prevention | Reviews require COMPLETED today. Missing the seven-day first-closure window and fully refunded review eligibility/label behavior |
| Chat and support | Persisted text conversations, unread/read state, polling client, support queues/replies, authorized evidence access and in-app notices | Tencent IM, product/order cards, required media/moderation/archive behavior and real offline push |
| Feedback | Existing support is reusable infrastructure | No standalone feedback record, own-history/detail flow, dedicated admin reply workflow or feedback-reply notification found in the main app/API/schema |
| Admin dashboard | Accounts/identity/seller/product governance, categories, orders/payments, refunds/complaints, support, reviews, finance/withdrawals, files, policies/configuration and audit modules | New catalog controls, evidence-based completion oversight, versioned adjudication/appeals/holds, feedback handling and live-provider exception queues |
| Reporting | Dashboard and finance aggregations exist | Confirm official date/cohort definitions and reconcile adjusted commission/refunds. Current finance summary labels UTC and mock provider data; PRD seller periods require Beijing calendar periods |
| Runtime foundation | Database migrations, reliability/outbox/jobs, worker/scheduler code, environment validation and production guards | Real worker publisher, external adapters, deployment wiring and real operational acceptance |

## Most consequential findings

### 1. Direct purchase is not implemented in the main transaction engine

PRD AC09–AC16 and Overview section 5 require pay, start, deliver and confirm without appointments or seller acceptance. The current [order request](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/order-payment.controllers.ts:13) requires `slot_id` and `service_starts_at`; seller accept/reject endpoints remain. [Service start](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/order-payment.service.ts:300) also waits for the scheduled start.

[Rule versioning](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/packages/contracts/src/order-rules.ts:5) protects legacy orders and rejects unsupported rules. That is useful compatibility work, but only version 1 appointment handlers exist. It does not activate V3.1 transaction behavior.

### 2. Verified-adult purchasing is not enforced by the inspected server path

PRD U-02 and AC05 require server rejection before an unverified or underage buyer creates an order. [Order creation](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/order-payment.service.ts:39) validates the product, seller, SKU, slot and price; [payment creation](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/order-payment.service.ts:85) checks order ownership/state and accepted policy. Neither performs the required buyer identity/adult check. The authentication guard checks authentication/session status, not verified adulthood.

Identity submission currently uses [MANUAL_REVIEW](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/identity-user.service.ts:530), rather than the checklist's live two-element verification provider. Seller admission checks VERIFIED status, but its required fields remain companionship-specific: [submission](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/seller-product.service.ts:164), [required fields](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/seller-product.service.ts:791).

### 3. Refund accounting differs materially from the new business model

PRD section 17/AC42 and Overview section 6 require zero commission if any amount is successfully refunded on a valid order. For ¥100 paid and ¥20 successfully refunded, the seller must ultimately retain ¥80 and the platform ¥0.

The current [refund ledger calculation](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/packages/application/src/finance-ledger.ts:78) apportions the refund between original seller income and platform commission. Assuming the original 10% commission and a settled order, a ¥20 refund reverses ¥18 seller income and ¥2 commission, leaving ¥72 seller entitlement and ¥8 commission. This is a code-derived example, not a newly executed live transaction. It is correct only for the older proportional model and must not be used for new-rule orders.

### 4. Completion and dispute handling are incomplete against V3.5

The [completion endpoint](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/order-payment.controllers.ts:40) accepts an order version, without completion evidence. [Completion logic](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/order-payment.service.ts:309) starts a configured confirmation timer immediately.

PRD AC15–AC47 additionally require five valid images, recording at actual payment ≥¥200, a 72-hour inspection window and shared one-time 24-hour extension, exact pause/restoration behavior, proposal rounds, effective rulings, appeals, supplementary fulfillment and distinct financial holds. The existing [after-sale service](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/after-sale.service.ts:48) supplies a simpler refund/complaint process, not that complete system. [Review creation](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/after-sale.service.ts:278) also lacks the required first-closure review window.

### 5. Production enablement needs implementation work

| Dependency | Current evidence | Needed before production use |
| --- | --- | --- |
| SMS | Development provider or injected implementation | Alibaba SMS adapter, approved templates, delivery/failure handling |
| Identity | Manual review records | Live two-element verification, adult eligibility and account matching |
| WeChat/Alipay | Mock providers and injectable interfaces | Selected eligible provider/PSP adapters; payment, refund, split/reversal/query and reconciliation |
| Payout | Mock provider and injectable interface | Same-name account validation, genuine payout/query/failure reconciliation |
| OSS | Wrapper requires an adapter; normal construction passes configuration only | Concrete OSS client implementation and integration validation |
| IM/push/moderation | HTTP polling text and in-app notices | Tencent IM/push/chat moderation, Alibaba non-chat moderation and approved archive rules |
| Worker events | Only logging publisher is accepted by the config enum; protected environments reject it | Production publisher and actual event consumers/delivery |

Evidence: [provider wiring](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/app.module.ts:85), [OSS wrapper](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/api/src/object-storage-provider.ts:300), [chat transport](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/mobile/src/features/chat/chat-transport.ts:12), [worker configuration](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/apps/worker/src/config.ts:3).

Production guards are valuable: they prevent development payment/SMS/payout modes from being treated as production. They do not supply the missing adapters. Choosing a server later will not by itself finish these integrations.

## Recent category work: exact boundary

The [category implementation notes](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/docs/service-category-publishing.md) describe shared code and migration 0011. Administrators can define up to 20 public text fields per category; seller forms load those fields and required answers are checked on submission. Product review and order snapshots preserve purchased details. Category writes require permissions/MFA and an audited reason.

The feature deliberately preserves legacy clients and orders. Legacy clients may still create uncategorized listings. Disabling a category prevents new categorized edits/submissions but does not automatically delist existing approved products. No categories are seeded. Package duration and appointment checkout remain. The [schema](/Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/packages/database/src/schema.ts:563) therefore provides a category foundation, not complete four-game virtual-goods publishing.

## Document decisions still open

- Supply Framework V3.1 and record the approved rule baseline/effective date, preserving existing-order rules.
- Resolve message/evidence retention: PRD section 11 requires three years; checklist Integration Details D06 specifies 180 days. Define retention separately from normal chat roaming.
- Resolve seller public review replies: overview allows them; PRD lists them outside confirmed release scope.
- Confirm game/category fields, capacity/stock reservations and secure handling for any sensitive delivery data. Ordinary public category text fields are unsuitable for credentials.
- Confirm product revision policy, reporting time attribution, withdrawal limits, media limits and target release devices. These are named PRD decisions, not license to invent defaults.
- Obtain provider confirmation that ordinary individual sellers can onboard, receive splits and withdraw using the selected payment products. The checklist explicitly identifies eligibility as a launch blocker.
- Keep rentals closed until their game permissions, login, access recovery, non-overlapping inventory, dispute rules and settlement behavior are verified.

## Recommended completion order

1. Freeze the requirement baseline and transaction-critical decisions. Keep older orders under their own rules. Retain the existing traceability map but update it with this review and later test evidence.
2. Complete marketplace identity/store/catalog behavior: adult verification, item-only onboarding, four games, permitted categories, stock, checkout fields, delivery promises and edit/review behavior.
3. Implement the new versioned direct-purchase and fulfillment flow, including completion evidence and server-owned deadlines/actions.
4. Complete disputes, proposals, rulings, appeals, supplementary fulfillment, independent holds, refund execution and full commission waiver. Demonstrate ledger reconciliation and races before real-money activation.
5. Finish the production provider and worker integrations. Provider eligibility/preparation can proceed alongside the domain work, without needing deployment now.
6. Complete Tencent messaging/cards/push, standalone feedback, reviews, discovery/navigation, statistics and the corresponding admin workflows. Preserve implemented search/favorites/account lifecycle behavior.
7. Run release-specific AC01–AC64 and Framework K01–K37 where applicable, migration/recovery tests, real provider journeys and native iOS/Android checks. Later deployment also requires HTTPS/secrets, alerts, backup restore proof and release operations.

Actual quick matching, coupons, rooms/calls, physical goods and account sales should not be added to this completion backlog as though required. PRD-required placeholder entries for Quick Match/Coupons are distinct from building those businesses.

## Verification and limitations

Reused checks completed earlier in this conversation for the category implementation:

- API and web builds; mobile/web type checks; focused lint: passed.
- Focused API/migration tests: 20 passed.
- Native seller regression tests: 13 passed. These are not device UI automation.
- Schema-contract tests: 19 passed; full isolated migration-chain test passed.
- Migration metadata and diff whitespace checks passed. Local development migration status was 12 expected / 12 applied / none pending after migration 0011.

Those results cover their tested behavior. They do not establish V3.5 acceptance, real payment/provider behavior or native UI acceptance. The older M0 audit's larger suite totals are historical and were not presented as fresh results.

This review used source inspection and document comparison; no additional product tests or live transactions were run. No Metro, frontend server or simulator was started for this review. No deployment was attempted. The working tree contains substantial uncommitted work; reviewed code is not evidence that the same revision is committed, pushed or deployed.

The separate Sammy prototype includes explicitly simulated checkout. Its screens and stored simulated orders are not counted as implementation of the main platform's production transaction rules.
