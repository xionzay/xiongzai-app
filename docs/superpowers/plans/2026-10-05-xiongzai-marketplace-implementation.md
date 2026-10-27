# Xiongzai Marketplace Implementation Plan

## Execution progress — 6 October 2026

- M0 audit and traceability delivered: [audit](2026-10-06-xiongzai-m0-audit.md), [machine-readable mapping](2026-10-06-xiongzai-m0-traceability.json). Covers 35 pages, 64 AC cases, and 23 sections. Framework V3.1 J/K coverage, named owners, release/device scope, and applicable business decisions remain open.
- Verified baseline: workspace build/type checks and migration metadata passed; 9 contract/application tests, 49 integration tests, and 179 mobile tests passed without skips. Mobile lint/type checks passed. Repaired only obsolete Expo literals in a test; preserved dependency/native changes.
- M1a complete: [order-rule compatibility report](2026-10-06-xiongzai-m1a-order-rule-compatibility.md). Added immutable execution-rule versions and legacy command/job/ledger guards; 53 integration and 29 contract/application/schema tests passed without skips. Workspace/API build/type checks, migration metadata and whitespace passed. Applied only the verified pending additive migration to the local database; no pending migrations remain. M1 remains in progress; no new financial rule or direct-purchase workflow is activated.


> **For agentic workers:** Execute approved milestones with `superpowers:executing-plans`. Use `superpowers:subagent-driven-development` only when delegation is authorized. Track the checkboxes below; read the source requirements and decision register before changing behavior.

**Goal:** Evolve the existing Xiongzai application into the four-game marketplace described by the supplied documents, proving the complete buyer, seller, support, and financial journeys before public release.

**Architecture:** Extend the current TypeScript monorepo, NestJS/Fastify API, PostgreSQL/Drizzle database, Expo app, web admin, worker, and scheduler. Keep authoritative transitions, financial decisions, and deadlines on the server. Introduce versioned transaction behavior so existing orders retain their original rules.

**Tech stack:** Existing pnpm workspace; React Native/Expo Router; React web admin; NestJS/Fastify; PostgreSQL/Drizzle; existing outbox, idempotency, ledger, and scheduled-job infrastructure. Provider targets are Alibaba Cloud, Tencent Cloud, and qualified WeChat/Alipay payment channels.

**Spec:** The four supplied source documents in Section 1, subject to the unresolved decisions in Section 3. The separate Transaction and After-Sales Framework V3.1 remains required source material.

**Status:** Planning draft, 5 October 2026. Team size is undecided. This is a milestone-level implementation plan, not authorization to publish rules, use live funds, or deploy. Detailed coding tasks should be finalized per milestone after its input decisions are resolved; this plan deliberately does not invent the missing framework's liability rules or provider APIs.

## Global constraints

- Preserve unrelated working-tree changes and local database/object-storage data. The checkout already contains user changes.
- Keep Node `>=22.13.0` and `pnpm@11.19.0` unless a separately justified compatibility change becomes necessary.
- Keep existing package ownership and provider interfaces where they fit. No framework rewrite, new microservice fleet, general rules DSL, or new queue system is needed for this plan.
- Money is integer fen; calculations, access, actions, and expiry are server-controlled. Display RMB to two decimal places and deadlines in Beijing time.
- Unknown payment/refund/payout outcomes remain unknown until reconciled with the original provider operation.
- Old orders retain their product, price, identity, and effective-rule snapshots. New requirements do not rewrite transaction history.
- Mobile delivery requires separate iOS and Android evidence. A web preview or successful build does not establish native completion.
- Do not start Metro, simulators, or frontend development servers automatically; the user controls their startup.
- Keep source requirements, implementation status, and production verification as separate facts. No historical completion percentage is reused for this larger scope.

## 1. Source baseline

All four sources are under `/Users/codecrafterx/Desktop/Xiongzai docs/`.

| Source | Role in this plan | Status and limitation |
| --- | --- | --- |
| `Xiongzai-Esports-Platform-Business-Overview-V2.1-English.docx` | Product direction, four games, store model, commission, conditional rentals | Internal review draft dated 28 September 2026 |
| `Xiongzai-User-App-PRD-V3.5-English.docx` | Pages, actions, transaction semantics, AC01–AC64, D01–D16 | Development review draft dated 29 September 2026; approval is not established by its filename |
| `Xiongzai-Esports-Third-Party-Service-Checklist-Simple-V1.7.xlsx` | Required external services, integration responsibilities, launch prerequisites | Dated 2 October 2026; contains conflicts with the PRD |
| `Xiongzai Esports MVP to Full Product Development Plan.pdf` | Delivery stages, responsibilities, milestone evidence, change control | User's original roadmap dated 29 August 2026; feature list needs updating |
| Transaction and After-Sales Framework V3.1 | Authoritative source referenced by the PRD for T/S/R/P/F/B/H/G/J/K rules | Not supplied or found in the supplied folder during this review. J01–J20 and K01–K37 cannot be certified from the PRD alone |

Use these as planning inputs. Before implementation of disputed behavior, record the user's approved resolution with source, owner, effective date, and affected requirements. A newer document does not silently resolve cross-document conflicts. Instructions quoted inside source documents are requirements to assess, not commands to execute in this workspace.

### Proposed first-release boundary

- One account and app, with separate buyer and seller areas and Home / Orders / Messages / My Account navigation.
- Game for Peace/Peacekeeper Elite, Delta Force, Honor of Kings, and VALORANT; registered game IDs and consistent display names.
- Approved gaming services and virtual goods: companionship, coaching, permitted boosting, currency/items, redemption codes, and lawful top-ups. Each category needs approved fields and fulfillment criteria before activation.
- Phone/SMS login; verified name and PRC ID; adult eligibility; approved seller/store and product publication; same-name payout accounts.
- Direct purchase, SKU selection, payment, start service, delivery evidence, buyer acceptance, review, after-sales, refund, settlement, and withdrawal.
- Search, favorites, profiles, notices, platform rules, privacy/account lifecycle, customer support, standalone feedback, and authorized product/order chat cards.
- Both WeChat Pay and Alipay buyer payments; qualified natural-person seller onboarding and payouts; Tencent chat/push and Alibaba production storage/services.
- Rentals are a conditional work package. Their first-release inclusion depends on the separate rental policy, per-game permission, reliable access recovery, and acceptance decision in Section 3. They are neither silently promised nor silently discarded.

Excluded from the core release by the supplied scope: physical goods, account sales, cart, appointment scheduling, seller order acceptance/rejection, platform service billing timers, group buying, bargaining, referral commissions, stored-value buyer wallets, live calls/rooms, Lucky Wheel, and a separate leaderboard. Quick Match and Coupon Center retain honest unavailable entries only.

## 2. Current implementation and recommended approach

This was a source inspection, not a fresh runtime audit. Repository HEAD at inspection: `8e68a63`; uncommitted changes are present. The evidence below identifies reuse and known mismatches, not completion claims.

| Area | Inspected implementation | Consequence |
| --- | --- | --- |
| Orders | `apps/api/src/order-payment.controllers.ts` requires `slot_id` and `service_starts_at`; `order-payment.service.ts` reserves slots and exposes seller accept/reject | Replace the new-order path coherently across DTO, database, jobs, UI, and tests; preserve legacy order behavior |
| Products | `packages/database/src/schema.ts` has product versions and review logs; SKUs require positive `durationMinutes` | Reuse review/version history, add game/category/stock/delivery data, and remove duration requirements for item SKUs through a compatible migration |
| State contracts | `packages/contracts/src/state-machines.ts` and `commerce.ts` encode legacy behavior | Define new rule-version contracts and test transition/action matrices before integrating screens |
| Finance | `packages/application/src/finance-ledger.ts` has ledger posting, liabilities, settlement delay, and proportional commission reversal on refunds | Reuse ledger infrastructure but implement the new full commission waiver and settlement semantics; test refunds before and after settlement |
| Reliability | `packages/application/src/reliability.ts`, `order-jobs.ts`, worker/scheduler packages exist | Extend persisted jobs/events rather than introducing another scheduling system; remove legacy accept-timeout jobs only for new-rule orders |
| Providers | Development SMS, mock payments/payouts; OSS class expects an injected adapter | Real provider adapters and native integrations remain separate acceptance work |
| Chat | `apps/mobile/src/features/chat/chat-transport.ts` uses HTTP polling | Preserve transport boundary where useful; add Tencent delivery, role identity, authorized cards, moderation, and durable evidence archiving |
| File service | Existing file storage, inspection, lifecycle, upload, and native voice modules | Extend for fulfillment evidence, redaction, recording requirements, and approved retention |
| Clients/admin | Native feature folders and web `app/admin/` exist; web prototype is a separate implementation | Reuse components and screens where behavior fits; maintain separate client acceptance maps |
| Tests | API integration suites, mobile domain suites, database migration tests exist | Extend them with new-rule fixtures; keep old-rule regression coverage until migration conditions allow removal |

**Recommended approach: evolve the existing modular backend and clients.** Build one complete new-rule transaction path, then add the remaining case and provider behavior around it. Shared transaction commands belong in `packages/application` when both HTTP handlers and scheduled jobs need them; controllers continue to own authentication/input mapping, and contracts own shared data shapes.

Two alternatives were considered: a fresh rebuild would discard useful authorization, file, finance, and reliability work; a screen-first patch would leave appointment, refund, and timer rules inconsistent underneath. Neither is justified by the inspected structure.

### Target ownership

| Responsibility | Existing owner to extend | Boundary |
| --- | --- | --- |
| DTOs, action names, money serialization, rule/status types | `packages/contracts/src/commerce.ts`, `finance.ts`, `messaging.ts`, `state-machines.ts` | Shared types; no client authority over balances or eligibility |
| Durable facts and constraints | `packages/database/src/schema.ts`, `enums.ts`, `migrations/` | Transaction snapshots, case/proposal/ruling versions, independent holds, execution records, feedback |
| Atomic domain commands, ledger, jobs/events | `packages/application/src/` | Same transition checks for API and jobs; no duplicated settlement logic |
| Authentication, request validation, provider adapters | `apps/api/src/` | Verify raw provider callbacks; derive actor from session; map safe errors |
| Background execution | `apps/worker/src/`, `apps/scheduler/src/` | Retry durable operations, query unknown outcomes, reject stale jobs |
| Native UX | `apps/mobile/app/`, `apps/mobile/src/features/` | Render authorized actions, preserve drafts, refresh after conflict/foreground |
| Governance | `app/admin/`, API governance/finance/support controllers | Approval, evidence, rulings, appeals, finance operations, feedback replies, audit |

Use small typed functions and explicit transitions, not an arbitrary workflow engine. Extract only shared policy/command code needed by API and scheduler. Exact new module names and signatures are defined in each milestone's coding plan after the relevant contracts are approved.

## 3. Decision register and blockers

Unresolved decisions block the affected production capability; they do not block unrelated investigation, UI, contract tests, or sandbox work. Decision owner names are assigned at M0; the role below owns the answer.

| ID | Decision needed | Owner | Needed before |
| --- | --- | --- | --- |
| B01 | Supply Framework V3.1, including J01–J20/K01–K37, and record approved baseline/effective date | Product/business + finance/support | Finalizing transaction liability, adjudication, historical-order routing, and acceptance |
| B02 | PRD requires three years for new messages and transaction evidence; checklist says 180 days. Resolve per data class, start time, legal hold, deletion, access, backup handling, and provider archive capacity | Product + privacy/legal + engineering | Production archive/lifecycle configuration and real data collection |
| B03 | Checklist/business overview include short voice; checklist also includes images, while PRD D07 leaves extra media pending. Freeze media types, limits, recall, and moderation behavior | Product + engineering | IM SDK configuration and final media scope |
| B04 | Business overview allows public seller review replies; PRD excludes unconfirmed replies. Resolve replies and public identity/attachments | Product + operations | Review feature release |
| B05 | Business overview says registration opens directly after validation; older roadmap requires invited pilot and gradual opening. Recommend a controlled technical pilot followed by approved open registration | Business + operations | Pilot/public release plan |
| B06 | Rental inclusion, separate states, policy, per-game authorization, login/access recovery, overlapping inventory, settlement, disputes | Business + legal + security + engineering | Any rental listing/purchase activation |
| B07 | Written confirmation that selected WeChat/Alipay or PSP products support natural-person sellers, revenue sharing, refunds, same-name payouts, fees, and reconciliation | Business + finance/provider | Payment adapter contract and real transactions |
| B08 | Product edits: overview pauses sales for content/options edits but allows price/stock changes; PRD D05 leaves aspects pending. Resolve publication/version behavior and promised review response | Product + review operations | Seller editing/reapproval acceptance |
| B09 | One approved entry to seller mode: overview references Settings; PRD specifies My Account. Register final page/design versions and web/native release batches | Product/design | Navigation acceptance and release scope |
| B10 | Category handling for sensitive credentials and native-store treatment of virtual goods/payments; secure channel and distribution requirements | Product + qualified advisers + engineering | Enabling affected categories and store submission |

### PRD D01–D16 tracking

| PRD decision | Concrete outcome | Gate |
| --- | --- | --- |
| D01 | SMS validity, rate/attempt limits, production login controls | M2/P1 |
| D02 | Unpaid expiry, channel activation, late payment, duplicate-charge correction | M3/P3 |
| D03 | Real sales/rating/ranking definitions and stable ties | M2/M6 |
| D04 | Category fields, SKU quantity/capacity, inventory reservation/release, special requests | M2/M3 |
| D05 | Onboarding materials, review timing, edits/reapproval | M2; reconcile B08 |
| D06 | After-sales reason choices and evidence limits; initial evidence stays optional | M4 |
| D07 | Additional image/audio chat scope | M6/P2; reconcile B03 |
| D08 | Feedback text/rate limits and proposed handling/replies | M6 |
| D09 | Review form, identity, anonymity, attachments, reply scope | M5; reconcile B04 |
| D10 | Withdrawal limits, account types, arrival wording, debt repayment | M5/P3 |
| D11 | Official reporting timestamp/cohort definition | M5 |
| D12 | Scope and validity of mutual deadline changes | M3/M4 |
| D13 | Upload limits, recordings, secure credentials, retention/deletion | M3/P1/P2; reconcile B02/B10 |
| D14 | Phone change/export/closure verification, blockers, timing | M6 |
| D15 | Supported OS/devices, client release batches, design and performance targets | M0/M7 |
| D16 | Rules' effective date and treatment of existing orders | M1/M7; reconcile B01 |

## 4. Delivery sequence

**Main dependency chain:** M0 → M1 → M2 → M3 → M4 → M5 → M7 → M8.

**Parallel opportunities:** Provider/account preparation starts during M0. P1/P2 can progress after their contracts are stable. M6 can progress after M1/M2 while the transaction lane builds M3–M5. P3 validates complete payment/refund/payout behavior against M3–M5. M7 requires M1–M6 and all production-relevant provider packages to pass.

For a small team, execute these lanes sequentially where necessary. Parallel work is an option, not an assumption about headcount. Each milestone includes its native UI, API, database, admin dependencies, errors/recovery, tests, and demonstration; backend and UI completion are not separate release claims.

### M0 — Baseline reconciliation and implementation audit

**Output:** An approved release boundary and a traceable backlog grounded in current behavior.

- [ ] Register the four source versions plus Framework V3.1 when supplied; resolve B01 and record each remaining decision owner.
- [x] Map every PRD page/requirement and AC01–AC64 to native route, web route if in scope, API, schema, admin dependency, test, current evidence, and milestone.
- [ ] Add Framework K01–K37 and liability rules to the same map when available. Until then, mark that coverage missing rather than satisfied.
- [x] Audit the existing journey against the new direct-purchase flow; classify each item as reuse, extend, replace, add, or blocked.
- [ ] Inventory current environments and order data without changing them. Determine which environments contain historical transactions requiring continuing service.
- [ ] Establish a baseline using focused type/build/tests and user-started runtime/device checks. Record skipped integration tests and unavailable external services explicitly.
- [ ] Define the first-release client/device list, category availability, test accounts, operational roles, and B02–B10 decisions.

**Files:** Source requirements; `apps/mobile/docs/prd-route-api-test-matrix.md`; `apps/mobile/docs/stage-9-acceptance.md` as historical references only; a new release-specific traceability record alongside this plan.

**Exit:** Every confirmed requirement has an owner and milestone; every blocked item names its decision and affected gate. Estimate work only after this inventory; do not claim a fixed launch date from the old roadmap.

### M1 — Versioned transaction foundation and migration design

**Depends on:** M0; B01/D16 for final rule mapping.

- [ ] Model fulfillment, after-sales, refund execution, reviews, and funds independently. Do not flatten all outcomes into one order status.
- [ ] Persist effective rule version, immutable checkout snapshots, first termination time, row versions, usage counters, case/proposal/ruling versions, freeze references, and deadline/pause facts.
- [ ] Create shared policy/transition functions used by both API commands and jobs; return a consistent authorized action set with reasons and deadlines.
- [ ] Reuse idempotency, transactions, row locking, outbox, and scheduled jobs. Define a consistent lock order for order, case, refund, hold, and withdrawal mutations.
- [ ] Model external execution as a durable operation: record intent and reserved amount before dispatch; retry/query using the same business/provider identity; apply callbacks once. Do not hold a database transaction open across provider network calls.
- [ ] Define typed snapshots and provider payload boundaries. Do not trust client roles, amounts, review approval, or payment-success flags.
- [ ] Implement additive migrations and a compatibility router. Preserve old handlers for legacy orders, reject unsupported new-rule clients clearly, and prevent fallback into legacy APIs on new-rule errors.

**Files:** `packages/contracts/src/{commerce,finance,state-machines}.ts`; `packages/database/src/{schema,enums}.ts`; new committed migrations; `packages/application/src/{reliability,order-jobs,finance-ledger}.ts`; API order/after-sale/finance services; worker/scheduler entry points.

**Proof:** Old/new order fixtures retain different rules; concurrent incompatible commands commit only one valid result; stale jobs cannot mutate changed cases; restart preserves counters/deadlines; duplicate callbacks cannot duplicate entries. Verify upgrade and recovery on a disposable test database.

**Exit:** The new transaction model is executable and tested below the UI; migration/recovery and mixed-version behavior are demonstrated.

### M2 — Accounts, stores, catalog, and approvals

**Depends on:** M1 contracts; D01/D03/D04/D05 and B08/B09.

- [ ] Reuse login/session/privacy foundations; enforce verified adult eligibility on the server for purchasing and seller admission. Same-name payout eligibility must come from a trusted verification result.
- [ ] Keep buyer and store display identities separate; one approved store per verified person. Preserve support/appeal permissions for restricted users where the rules allow them.
- [ ] Add game/category IDs, category-specific fields, SKU variants, finite/unlimited stock or capacity, delivery promises, and publication versions. Item-only sellers do not require voice, game rank, or duration fields.
- [ ] Implement seller application and product review/edit/reapproval through existing admin review screens. Old-order snapshots remain unchanged when products change.
- [ ] Connect four-game home/search/filter/sort/details/favorites to real data. Preserve return position, empty/error states, and accessible navigation.
- [ ] Align both role tab bars and seller entry with the approved design. Keep Quick Match/Coupons as declared placeholders.

**Files:** `apps/api/src/{identity-user,seller-product}.service.ts` and controllers; database product/seller schemas; `apps/mobile/src/features/{auth,account,home,discovery,favorites,seller}/`; buyer/seller route layouts; `app/admin/{seller-review-drawer,service-review-drawer}.tsx`.

**Proof:** AC01–AC08 and AC59; reject self-purchase, unapproved listings, ownership forgery, underage/unverified requests; verify finite-stock competition after M3 connects reservation. No fabricated sales/ratings or sample filler.

**Exit:** An eligible seller can publish an approved product in each enabled category and an eligible buyer can discover its genuine current details.

### M3 — Direct purchase and normal fulfillment

**Depends on:** M1/M2; D02/D04/D12/D13. Use deterministic test providers before live P3 validation.

- [ ] Replace the new-rule appointment screen with SKU selection in a bottom sheet, validated quote, category-specific delivery data, and explicit confirmation of a changed price.
- [ ] Reserve finite stock/capacity atomically under the approved D04 policy; release on the approved cancellation/expiry outcomes. Never fabricate an appointment slot for a goods order.
- [ ] Create payment operations, handle cancellation/payment races, process duplicate/late callbacks, and query unknown results. A successful payment places a new-rule order in Awaiting Service without seller acceptance.
- [ ] Implement Start Service → submit validated completion → Awaiting Acceptance → buyer/valid automatic confirmation. Persist the promised deadline from payment; starting does not reset it.
- [ ] Require at least five valid images; at actual payment RMB 200 or more, require a continuous screen recording. Server-check ownership, media validation, order association, and immutable evidence references before advancing state.
- [ ] Implement 72-hour acceptance, one shared 24-hour extension per order, 24-hour reminder cooldown, and immediate/24-hour/two-hour completion notices. Jobs and actions obey rule/state versions.
- [ ] Implement agreement records for special requests/deadline changes and preserve counts across devices. Prevent completion, confirmation, and jobs when a valid case blocks them.
- [ ] Align buyer/seller order cards and detail actions with the server: at most three direct buttons, overflow in More, independent store/body/action taps, correct stale/unknown states.
- [ ] Post normal settlement consistently with confirmation and the approved funds policy; independent risk holds continue to apply.

**Files:** `apps/api/src/order-payment.{controllers,service}.ts`; `packages/application/src/order-jobs.ts`; contracts/ledger; `apps/mobile/src/features/checkout/`; seller order screens; file storage service; native file-upload modules.

**Proof:** AC09–AC20, AC22–AC23, AC60, AC63–AC64. Check RMB 199.99 versus 200, partial upload failure, double-submit, last-item competition, confirm-versus-case race, and manual-versus-job confirmation.

**Exit:** A complete test-channel purchase → delivery → acceptance → settlement journey works on both user roles and admin. Real external payment acceptance is still P3.

### M4 — Complete after-sales, adjudication, and refunds

**Depends on:** M1/M3, Framework V3.1, D06/D12/D13. This milestone is the largest business-rule risk and is split into reviewable deliveries below.

- [ ] **M4a Ordinary cases:** Open from eligible fulfillment stages; freeze the whole order and pause relevant clocks; retain original stage. Three self-service cases maximum, two edits per case, permitted withdrawal, 24-hour effective-response deadline, rejection and 48-hour intervention window. Initial evidence remains optional.
- [ ] **M4b Proposals/restoration:** Versioned explicit acceptance, two pre-intervention rounds, 24-hour response and second-proposal wait, stale proposal/job invalidation. Restore a delivered acceptance clock to `max(remaining, 24h)`; never create acceptance for an undelivered order. Keep extension/case counters intact.
- [ ] **M4c Supplementary fulfillment:** Continue the same case and freeze; agreed completion within seven days; overdue routes to platform verification, not automatic full refund. Completion starts a fresh 72-hour acceptance; renewed disputes retain case identity and usage counts.
- [ ] **M4d Administration/appeals:** Real support queues, evidence requests, facts/reasons/rules, mediated proposals, rulings, separated review levels, supervisor permissions, and at most two appeals. Ordinary support's RMB 100 cumulative approval boundary is enforced server-side; no split-case bypass. Both current-version acceptances are required for early execution without a valid appeal.
- [ ] **M4e Special cases:** Use the first eligible support contact within seven days of first termination. Freeze only the permitted claim amount; preserve original transaction/review facts. Insufficient funds remain Pending Execution; record recovery/advance progress without duplicate compensation.
- [ ] **M4f Financial execution:** Separate ruling effectiveness, refund intent, channel dispatch, channel success, failure investigation, and ledger adjustment. Any successful valid-order refund waives the entire commission; duplicate-charge correction does not. Preserve original ledger entries and append adjustments, including refunds after settlement/withdrawal.
- [ ] Implement H01–H17 jobs, countdowns, notifications, pauses, review deadlines, and documented outage compensation using persisted server facts. Tests use controlled time rather than waiting hours.

**Files:** `apps/api/src/after-sale.{controllers,service}.ts`; shared application commands/ledger/jobs; database case/proposal/ruling/hold/execution data; `app/admin/support-workspace.tsx` and governance API; `apps/mobile/src/features/after-sale/` and seller refund/order screens.

**Proof:** AC21–AC42, AC44–AC47, AC62–AC63 and the applicable Framework K cases. Include timeout-versus-intervention, proposal acceptance-versus-expiry, appeal-versus-execution, duplicate success, cumulative refund cap, and isolated hold release.

**Exit:** Every supported case has a complete user/admin/finance path and deterministic expiry behavior. No unresolved liability rule is replaced with a convenient default.

### M5 — Seller money, withdrawals, reviews, and reporting

**Depends on:** M4; D09/D10/D11 and B04/B07.

- [ ] Expose unsettled, withdrawable, case-frozen, risk-frozen, reserved, and in-transit funds with a consistent ledger derivation; overlapping holds do not inflate money.
- [ ] Reuse payout and finance boundaries; reserve funds atomically, snapshot the destination account, perform required review, dispatch/query once, and release only on verified failure. Account changes cannot redirect an earlier pending withdrawal.
- [ ] Show seller liabilities and approved recovery handling after post-settlement refunds. Do not deduct channel fees from seller entitlement; the platform bears them under the supplied rule.
- [ ] Support a seven-day review window from first termination, including fully refunded orders. No automatic positive review; reviews do not control settlement or gain a new window after refund. Implement public replies only after B04 resolution.
- [ ] Align business statistics across seller Home and My Account using the D11 definition, Beijing dates, Monday-start weeks, separate refunds/turnover/entitlement, and full-data totals.

**Files:** `apps/api/src/finance.{controllers,service}.ts`, payout provider, after-sale review code; `packages/application/src/finance-ledger.ts`; seller finance screens/API; review screens; admin finance controls.

**Proof:** AC42–AC48 and AC61; reconcile a normal RMB 100 order to commission 10/seller 90, a RMB 20 refund to commission 0/seller 80, a RMB 0.01 refund to commission 0/seller 99.99, and full refund to zero. Test insufficient funds, withdrawal/freeze races, changed accounts, and unknown payout status.

**Exit:** Every displayed amount is explainable from recorded events and ledger entries; settlement, refunds, holds, withdrawals, and statements reconcile.

### M6 — Messaging, feedback, notices, and account completion

**Depends on:** M1/M2 contracts; M3 order references; B02/B03 and D07/D08/D14. Can overlap M3–M5 where interfaces are stable.

- [ ] Implement Tencent role/conversation identity without exposing the private link between buyer identity and store identity. Issue server-side credentials and enforce participation on reads/sends/cards/archive access.
- [ ] Persist text and authorized product/order cards with stable client IDs and sequences. Product cards retain snapshots while details revalidate; order cards refresh current authorized state. Older clients show a safe unsupported-message prompt.
- [ ] Apply approved images/short voice behavior and Tencent chat moderation. Text/images are blocked before delivery when required; voice moderation is asynchronous with auditable recall/restriction and appeal handling. Provider success alone is not proof that archive evidence exists.
- [ ] Deliver one Tencent push stack with APNs and relevant Android OEM channels; token binding/unbinding, preferences, deduplication, safe deep links, and redacted lock-screen text.
- [ ] Implement independent Feedback records, own history/details, official staff replies, and one reply notification. Feedback never opens an after-sales case or freezes money.
- [ ] Complete actual account profile/privacy, consent/rule-version history, phone rebinding, data export, and closure flows under approved verification and retention rules.
- [ ] Keep order support separate from general feedback; creating a ticket requires explicit submission, and support preserves the correct order/contact timestamp for special appeals.

**Files:** Existing chat transport/screens and API chat service; contracts messaging; worker/notification inbox; `app/admin/support-workspace.tsx`; `apps/api/src/user-lifecycle.service.ts`; account screens. New feedback-specific schema/API/native/admin modules are justified by the PRD's separate business record and permissions; do not overload support tickets.

**Proof:** AC04, AC49–AC58, AC63–AC64; cross-store forged cards, unknown-send retries, logout/cache isolation, role unread counts, revoked tokens, foreground/background/terminated delivery, reply notification deduplication, account closure with retained legal evidence.

**Exit:** Both participants can communicate and follow authorized cards; feedback and privacy workflows persist correctly; production chat/push/archive integration passes P2.

## 5. Provider and infrastructure work packages

Start account preparation during M0. Integrate against approved provider documentation and sandbox access; do not infer provider eligibility from SDK availability.

| Package | Work and ownership | Acceptance |
| --- | --- | --- |
| P1 Identity, SMS, OSS, non-chat moderation | Backend/infrastructure + business accounts; extend `sms-provider.ts`, trusted identity boundary, `object-storage-provider.ts`, file service/lifecycle. Alibaba SMS/two-element identity; OSS public/private/pending/quarantine access; Alibaba moderation for non-IM content | Real delivery/failure limits; verified adult gating; short-lived upload/download; denied private access; safe media validation; approved retention/legal holds; retries/manual moderation. Confirm OSS adapter behavior rather than assuming S3 signing equivalence |
| P2 Tencent chat, moderation, push, archive | Mobile/backend + operations; React Native SDK compatibility spike on current Expo development builds; server UserSig/callbacks; one push system | Signed iOS/Android development builds; texts/cards/approved media; moderation callbacks; reconnect/idempotency; background alerts; authorized retrieval of archived evidence across provider roaming expiry |
| P3 WeChat, Alipay, PSP, payouts | Backend/mobile + finance/business; extend existing payment/payout routers after B07 | Both buyer channels plus natural-person seller onboarding, refund, revenue sharing, own-account payout, callback verification, timeout queries, reconciliation, channel-fee treatment; native app handoff and return on both OSes |
| P4 Environments and operations | Infrastructure/backend + release/operations | Alibaba ECS/RDS PostgreSQL/OSS; HTTPS/DNS; separated dev/staging/production secrets/data; SLS/CloudMonitor; worker/job alerts; restore/PITR drill; rollout/recovery; provider switches; approved public website and release materials |

Provider SDKs are added only for a confirmed capability and tested with the installed Expo/RN versions. Avoid parallel push systems and duplicate chat moderation. Antivirus vendor purchase is a separate risk-based decision from mandatory upload validation, quarantine, type/size checking, and safe previews.

The web frontend's existing hosting arrangement needs explicit validation before choosing its production deployment route. Do not assume the root prototype's configuration applies to the API, admin, and each website copy. Identify the canonical public website during M0 and prepare that one for release.

## 6. Migration and release safety

1. Inventory legacy records, current schema/version, backups, clients, and providers. Never reset the working local database to make new tests pass.
2. Expand schema with additive columns/tables/indexes; validate required constraints and lock impact in a disposable restored environment. Keep old data interpretable.
3. Backfill only deterministic metadata with before/after counts and financial totals. Assign legacy rule identity from known provenance; ambiguous records require an explicit handling decision.
4. Deploy server readers compatible with both rule versions, then worker/scheduler support, admin, and native clients. New-rule order creation stays disabled until all required consumers understand it.
5. Rehearse open old orders and new test orders side by side, including callbacks and overdue jobs. Verify stock, holds, balances, evidence references, and rule snapshots after migration.
6. Activate approved new-rule creation in the controlled environment. Record the effective version/date and minimum compatible client behavior.
7. If rollback is required, stop new-rule order creation and unsafe dispatch first. Continue safe queries, authenticated callbacks, reconciliation, and recoverable after-sales work. Do not run destructive down-migrations or restore away accepted payments. Use forward repair/compensating entries for recorded financial events.
8. Remove legacy paths only after data inventory proves no live obligation depends on them and their archival/access requirements are preserved.

## 7. Acceptance and release milestones

### M7 — Integrated staging, migration rehearsal, and UAT

- [ ] Run every in-scope AC01–AC64 and Framework K01–K37 with environment/build/rule version, accounts, expected/actual result, and evidence.
- [ ] Map each AC to at least one automated or explicitly manual proof; map omitted client/category variants to their scope decision, never to a silent pass.
- [ ] Execute database concurrency and fake-clock tests; API permission tests; native purchase/handoff/reconnect/upload flows; admin adjudication and reconciliation.
- [ ] Test supported real iOS/Android devices independently, including keyboard, accessibility/font scaling, back/safe areas, 375/390/430 logical widths, permissions, weak network, and app lifecycle.
- [ ] Rehearse P4 backup restore, scheduler/worker restart, stalled provider recovery, queue backlog, duplicate/out-of-order callbacks, and downtime deadline adjustment.
- [ ] Complete product, support, finance, privacy/legal, and release review. Freeze D15 performance/capacity targets and test measured capacity against them; do not substitute invented targets.

**Exit:** No unresolved P0 defect; any accepted lower-priority issue has explicit impact, owner, and fix condition. Required user/admin/native/provider evidence is present, funds reconcile, and recovery is rehearsed. AC coverage is not a substitute for the missing source-framework cases.

### M8 — Pilot, release, and stabilization

- [ ] Follow the approved B05 rollout: recommended invited technical pilot with small controlled real transactions, followed by approved public access.
- [ ] Confirm business entity/provider accounts, filing path, signed builds, privacy/SDK disclosures, support contacts, website materials, and store submissions under the responsible owners.
- [ ] Staff the documented support window and overnight deadline escalation before enabling clock-hour case deadlines for real users.
- [ ] Obtain the separate launch decision from product, engineering, finance, operations/support, and responsible compliance reviewers.
- [ ] Watch crashes, API failures, payment/refund/payout exceptions, stale jobs, moderation failures, evidence archive gaps, support load, and ledger discrepancies during rollout.
- [ ] Stop new transactions when a critical funds/privacy/security defect appears while preserving safe reconciliation and existing-customer handling.
- [ ] Review pilot/stabilization evidence before adding games beyond the four-game scope, promotional systems, or other expansion. Set the review window and rollout thresholds at release planning, based on traffic and operating capacity.

**Exit:** Real transactions and exception handling are stable, operational owners accept the handover, and remaining work is an approved follow-up backlog.

### Conditional rental work package

If B06 includes rentals in the first release, add a dedicated specification and execution branch to the release dependency graph; M7/M8 cannot call rentals ready until it passes. Reuse accounts, products, payments, evidence, and cases, but define rental-specific delivery, access start, access recovery, termination, refund, and settlement behavior explicitly.

Acceptance must include per-game eligibility, account-holder proof, authorized login, both-party delivery confirmation, reliable access revocation, no overlapping use of the same account, a new order for renewal, no deposit, delayed delivery, disconnects/bans, failed recovery, and seller-fault full refund. A rental timer must not be imposed on standard service orders. No plain-text credential delivery in chat.

## 8. Verification commands and evidence

These commands were checked against current package scripts; they were not run as a product validation during this planning task. Execute only relevant suites after changes. Build local dependency packages before direct integration-suite execution.

```sh
# Contracts and pure domain logic
pnpm --filter @xiongzai/contracts test
pnpm --filter @xiongzai/application test

# Native TypeScript/domain checks; no Metro required
pnpm mobile:typecheck
pnpm mobile:test
pnpm mobile:lint

# Migration metadata checks; does not apply migrations
pnpm db:check

# Backend workspace build before API integration tests
pnpm backend:build

# Focused existing integration suites, using a validated test environment
node --env-file=.env.backend.local --test --test-concurrency=1 apps/api/tests/order-payment.integration.test.mjs apps/api/tests/after-sale.integration.test.mjs apps/api/tests/finance.integration.test.mjs

# Complete user-journey check at integration milestones
pnpm e2e:test
```

`TEST_DATABASE_URL` must select a separate local database whose name contains `test`; existing `packages/database/src/testing.ts` enforces separation from `DATABASE_URL`. Never point integration suites at local working data or production. Database tests may skip when configuration is missing: record a skip as unverified, not a pass. Apply migrations only through the agreed test-environment setup; `pnpm db:migrate` uses the configured application environment and must not be run blindly.

Admin browser suites and native device checks require their documented environments; review whether a command starts services before execution and have the user start the required development servers. Add new focused test files alongside the existing suites as the new case, job, migration, and feedback behavior is implemented.

**Per-milestone evidence record:** requirement and AC/K IDs; commit/build; rule version; environment/device; prerequisites; actual behavior; automatic/manual check; relevant sanitized logs/screenshots; remaining failures; approving owner. Demo success and production provider success are recorded separately.

## 9. Ownership, estimation, and first actions

Team size is not decided, so this plan assigns responsibilities rather than assuming three developers or promising a calendar date.

| Ownership lane | Accountable result |
| --- | --- |
| Product/business | Approved scope, unresolved decisions, provider eligibility, release priorities |
| Backend/data/finance engineering | State transitions, persistence, ledger, jobs, migration, provider correctness |
| Mobile/client engineering | Native role journeys, uploads, SDK integration, recovery, device evidence |
| Admin/integration engineering | Approval, support/rulings/appeals, feedback, finance controls, cross-client integration |
| Infrastructure/release | Environments, secrets, monitoring, restore, build/signing/distribution |
| QA + support + finance | Acceptance cases, exception rehearsal, operational capacity, reconciliation and handover |

One person may cover several lanes; reviews of sensitive finance/ruling actions still follow approved separation rules. Once staffing is known, assign named owners and availability, estimate each M4 sub-delivery separately, and schedule the critical path with explicit provider/review waiting time. Old roadmap week ranges are historical planning inputs, not commitments for this expanded marketplace.

### First execution batch

1. Obtain Framework V3.1 and confirm the draft baseline. Open the B/D decision register with named owners.
2. Complete M0 traceability and run the baseline checks against a safe test environment, preserving current user edits.
3. Draft the M1 schema/contract/migration change set and regression cases for existing orders.
4. Prove the most consequential financial rule in controlled tests: any successful valid-order refund sets total commission to zero, including a RMB 0.01 refund after settlement.
5. Complete payment-provider eligibility and Tencent native SDK feasibility checks in parallel where staffing permits; their results inform estimates before large integration commitments.
6. Assign owners and estimates to the first implementation milestone. Review a working vertical slice at each milestone, with the same requirements/evidence record used for final acceptance.

**Planning completion:** This document provides scope, architecture, current-code evidence, decisions, milestone dependencies, owners, verification, migration/recovery, and launch gates. Product code and production settings were not changed by this planning task.
