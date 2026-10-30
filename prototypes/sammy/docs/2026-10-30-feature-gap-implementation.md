# Sammy feature-gap implementation — 30 October 2026

Scope: `prototypes/sammy/` only. Fastify/Neon/Cloudinary architecture retained; Heroku is the backend host. Phone/password and simulated financial operations remain deliberate prototype choices. No remote database migration, deployment, purchase or privileged remote account change was performed in this implementation.

## Implemented paths

- Four-game companionship/coaching catalog: Peace Elite, Delta Force, Honor of Kings and VALORANT. Filtering, price sorting, server-side pagination, provider profiles and checkout follow the selected game. VALORANT accepts Unicode Name#Tag on the China server. K/D is required only for Peace Elite/Delta Force. Legacy missing-game records remain Peace Elite without rewriting historical snapshots.
- Separate product submission/review before publication, reasoned changes requests, revision checks and approval invalidation on edits. Historical orders retain their original service details.
- Store pages with approved profile snapshots, voice introductions, available products, genuine ratings/reviews, and private product/store favorites including unavailable-item removal.
- Home sections and five shortcuts, genuine completed-sales rankings, standalone feedback and official notices, and a Platform Rules page using existing order policy. Quick Match and Coupons remain unavailable placeholders.
- Admin-managed bilingual announcements: private drafts, explicit publish/unpublish, optimistic revision checks and audit entries. Public pages expose only published copy.
- Order list search/filtering before pagination, correct supplementary acceptance/refund/review states, whole-account counters, and seller queues/statistics using Beijing calendar periods. Turnover is distinguished from settled earnings.
- One buyer review per eligible order within seven days of its original termination, including full refunds. Later cases do not restart the review window; moderation is authorized and audited.
- Chat rich cards with historical public snapshots, current order/case states, filtered/paged card selectors, durable per-account drafts/pending sends, idempotent retries, older-history preservation and precise read acknowledgements. Polling remains foreground-only.
- Human-readable bilingual activity summaries, support/feedback filtering, and nonfinancial support operations independent of the payment simulation switch.
- Admin evidence access through authorized audited signed capabilities; reviewed redacted-copy upload/linking; product/review moderation and support actions.
- Account password change verifies the current password, preserves the current session, revokes other sessions and records a secret-free audit entry. Account export excludes password/session secrets, order delivery details and private storage capabilities.
- Explicit Heroku demo simulation policy: both `SAMMY_SIMULATED_PAYMENTS=true` and `SAMMY_HOSTED_DEMO=true` are required on a Heroku dyno (`DYNO` supplied by Heroku). Ordinary production remains blocked. The existing durable job loop uses the same gate. This is a code change, not verification of hosted flags, environment isolation or dyno uptime.

## Migration and deployment boundary

New migrations 0007–0010 are registered and tested on isolated PostgreSQL only. They add product review/game support, marketplace reviews/favorites, message snapshots and announcements. Migration 0007 intentionally changes existing published products to drafts requiring review, while preserving IDs, imported drafts and historical orders. Do not deploy new code against the old schema. Before live rollout, take preservation snapshots, apply these additive migrations to the intended database, verify records/migration history and review the affected products. Rollback must retain new columns/data and publication safeguards.

## Verification

- Final isolated PostgreSQL suite: **31 passed, 0 failed**.
- Final mobile unit/domain suite: **48 passed, 0 failed**.
- Backend build, mobile TypeScript, admin JavaScript syntax and whitespace checks passed.
- Admin UI smoke harness passed announcement draft/publication, explicit evidence access, redaction upload/retry, product review, server filters and review moderation.
- Browser against disposable local PostgreSQL: admin sign-in and bilingual announcement draft creation/persistence verified. This was not a Neon write.
- iOS JavaScript export succeeded. Native guest Home and the public Official Notices route loaded against the isolated API. Full account/provider/order walkthrough remains incomplete because automatic approval review hit a usage limit. A bundle build alone does not prove all device behavior.
- Test logs: `/tmp/sammy-final-integration.log`, `/tmp/sammy-mobile-final.log`, `/tmp/sammy-ios-export.log` (temporary files).

## Still open

- Live schema migration, Heroku rollout/configuration and hosted iOS/Android acceptance. No real channel charges or transfers were attempted.
- Real phone ownership/SMS/password recovery, verified identity/age gates, verified payout ownership, granular staff authorization/MFA and provider moderation/push integrations.
- Official legal/rule versions/effective dates, retention/legal-hold/deletion/account-closure policies and original Transaction Framework V3.1 acceptance.
- Remaining PRD workflows such as reminder cooldown, mutually accepted special-request/deadline agreements, outage-impact handling and shortage/advance recovery.
- The catalog slice is companionship/coaching across four games; it does not implement every item category/SKU/unit template from the full PRD.

These results demonstrate implemented prototype paths, not complete PRD acceptance or readiness for real-money public launch.

## Discovery layout follow-up

The full-size game/sort/service/style/team controls overwhelmed Home. Discovery now keeps a compact horizontal game row and a single Filters control. Sort and relevant secondary filters live in a labelled sheet with draft selections, Apply and Reset; companion browsing omits service-only filters. Section tabs and discovery controls have contained backgrounds and compact spacing. Mobile TypeScript passed; updated on-device visual verification remains blocked by the computer-use approval usage limit. The original mobile API configuration was restored after isolated QA.
