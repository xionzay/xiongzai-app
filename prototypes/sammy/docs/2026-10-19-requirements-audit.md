# Sammy prototype requirements audit — 19 October 2026

Scope: `prototypes/sammy` only. This is a source-backed gap review, not a fresh end-to-end acceptance certificate. Work in the company apps and other checkouts is not counted as integrated into this prototype.

## Sources and precedence

- Desktop/Xiongzai docs/Xiongzai Esports MVP to Full Product Development Plan.pdf — 29 August 2026, 13 pages. Delivery roadmap, not a frozen feature-by-feature launch scope.
- Desktop/Xiongzai docs/Xiongzai-User-App-PRD-V3.5-English.docx — 29 September 2026 development review draft. Defines full product, 64 acceptance cases and 16 pending decisions; approval status was not independently established.
- Desktop/Xiongzai docs/XIONGZAI_Business_Model_Culture_Launch_Plan_V4.1_EN.pdf — business/operating blueprint, 20 pages.
- Current user decisions: independent Sammy implementation; phone/password for prototype; Fastify, Zod, Neon target, Vercel target; WeChat Pay only; company bears channel fees.

No separately named scope PDF or original Transaction and After-Sales Framework V3.1 was located in the targeted document search. The PRD quotes its requirements but is not a substitute for auditing the original J/K rules. Re-share those exact files if different from the roadmap above.

## Findings

| Requirement | Current state | Remaining work |
|---|---|---|
| Bilingual mobile UI/onboarding | Implemented UI | Full native device, keyboard, accessibility and error-state acceptance |
| U-01 account access | Backend registration/login/logout, password hashing, hashed sessions, rate limits; SecureStore client | SMS deliberately deferred by user; recovery and verified phone ownership missing |
| U-02 identity/adult checks | Not implemented as verified backend identity | Real verification states, age gating, same-name payout checks |
| U-03 authorization/restrictions | Ownership checks and admin protections implemented | Granular restrictions and appeals; blanket suspension currently prevents all authenticated access, incompatible with future existing-order assistance |
| U-04 profiles/account rights | Profile, avatar, bio updates implemented | Phone rebinding, export, closure and retained-evidence policy |
| U-05 rules/agreements | Prototype agreement acceptance | Official version/effective dates, full Rules Center and order-time snapshots |
| B-01/B-02 home/discovery | Backend listings, keyword, category/mode filters, cursor pagination and detail | Required Recommended/Companions/Services structure, five shortcuts, four-game filter, store search and sales/rating/price sorts |
| B-03 store/favorites/reviews | Approved provider snapshot in listing details | Full stores, private favorites, genuine public reviews and rating calculations |
| B-04/B-05 catalog/SKU | Peace Elite, duo/squad, relaxed/ranked, hourly listing with photos | Delta Force, Honor of Kings, VALORANT, general permitted categories, SKU variants/quantity/capacity, category-specific delivery requirements |
| SELL-01 onboarding | Saved draft, photo/voice upload, submitted snapshot, admin changes request, resubmission, approval | Verified adult identity, payout verification, explicit rejection/restriction/appeal lifecycle, category-appropriate fields |
| SELL-02 seller home | Provider/profile/listing UI | Separate complete seller area, business counters and order queues |
| SELL-03 products | Draft/edit/publish/unpublish; approved-provider gate and consent; admin block/restore | Per-product submission/review before publication, rejection/relist lifecycle, edit reapproval policy |
| Purchase/payment | Local demo screens only; backend mode explicitly unavailable | Variant sheet, server-priced order creation, payment intent, WeChat handoff/callback/query/idempotency and exception handling |
| ORD-B/ORD-S fulfillment | Local demo has only unpaid/awaitingService/closed | Persisted V3.1 buyer/seller states/actions, start/completion/evidence, acceptance deadlines, reminders and race handling |
| AFT after-sales | Local demo request only; backend unavailable | Partial/full refunds, negotiations, intervention, appeals, immutable evidence, freeze/restoration and reliable deadline jobs |
| Reviews | No backend workflow | Eligibility window, one review per order, genuine ratings and moderation |
| Messaging/cards | Local demo conversations; backend unavailable | Authorized persistent chats, unread state, send/retry, product/order cards and real-time delivery |
| Notifications/support/feedback | Local action toasts | Persisted notices, push, tickets, independent feedback history/replies and admin handling |
| Funds/withdrawals/statistics | No backend financial subsystem | Integer-fen ledger, 10% commission rules, refund treatment, available/frozen funds, payout verification, withdrawal/reconciliation and metric definitions |
| Admin governance | Overview, users, providers, applications, services, action history; bilingual UI | MFA/staff roles, orders/finance/cases/support/feedback/review moderation, rule management, more detailed audit before/after metadata |
| Media | Private S3-compatible upload/download, byte validation, voice duration, immutable validated key | Production storage, evidence-specific policies, scanning, retention/deletion, credential handling for supported categories |
| Infrastructure | Fastify/Drizzle/Zod, migrations, Vercel configuration, persistent local launcher | Hosted Neon/storage deployment, jobs/scheduler, monitoring, backups/restore, staging separation, CI/CD and operational controls |
| Release acceptance | Existing unit/type/build proof; limited historical API/browser proof | Fresh admin integration/visual tests, native iOS/Android end-to-end, weak-network/concurrency/security/finance acceptance, real-channel pilot and store releases |

## Material differences to resolve

1. The August roadmap/business blueprint mentions appointments, scheduling and accept/reject-order steps. PRD V3.5 explicitly excludes these. Do not implement the older flow automatically.
2. The current prototype is a one-game hourly companionship slice. V3.5 is a four-game services/virtual-item marketplace. That larger scope is not delivered by the existing catalog.
3. Approved providers currently self-publish listings. PRD V3.5 requires product approval before listing. Post-publication moderation does not satisfy pre-publication approval.
4. Suspension currently rejects all authenticated API calls. Before transactions, preserve authorized existing-order fulfillment, support and appeals as specified.
5. Use WeChat Pay only and platform-paid channel fees per the user's later decisions; older documents listing Alipay do not override these.
6. The roadmap explicitly requires a confirmed MVP boundary. Do not call the entire V3.5 full-product draft an approved MVP or give a completion percentage without that denominator.

## Code evidence

- backend/src/schema.ts: users, sessions, media, applications, rate limits, listings and admin actions; no transaction/chat/finance tables.
- backend/src/app.ts and auth.ts: account, uploads, provider review and session checks.
- backend/src/admin.ts: current administration routes and suspension behavior.
- backend/src/listings.ts: narrow catalog validation and direct publication gate.
- mobile/src/features/marketplace/useHostedMarketplace.ts: orders/conversations are empty; placeOrder/payOrder/cancelOrder/submitRefund/sendMessage use the unavailable handler.
- mobile/src/features/marketplace/domain.ts and useMarketplace.ts: separate local JSON demonstration state, not server transaction implementation.
- mobile/src/features/marketplace/HostedDiscovery.tsx: actual API discovery filters and listing detail UI.

## Recommended order

1. Reconcile MVP scope with the latest PRD and obtain original transaction framework; record accepted prototype substitutions.
2. Complete catalog/category/SKU and pre-publication product review; identity/payout verification boundaries.
3. Build persisted direct purchase and buyer/seller order lifecycle; integrate WeChat when merchant access is available.
4. Fulfillment/evidence/deadline jobs, chat and transaction notifications.
5. After-sales/appeals/refunds, ledger/settlement/withdrawals and finance administration.
6. Remaining favorites/reviews/feedback/account rights; hosted and real-device acceptance, pilot and release gates.

Current position: account/provider/catalog/admin foundation; not a transaction-complete MVP. Existing tests do not establish real payment, deployment or native acceptance.
