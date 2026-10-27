# Xiongzai M1a — Order rule compatibility

**Date:** 6 October 2026. **Branch:** `codex/marketplace-implementation`.

**Outcome:** The first M1 slice is complete. Orders retain an immutable internal execution-rule version. Current appointment-era order/payment/refund/review commands, order jobs, and ledger posting/settlement reject unsupported versions instead of applying legacy rules. M1 as a whole remains in progress; direct purchasing and new financial rules are not implemented by this slice.

## Implemented behavior

- `orders.transaction_rule_version` is a positive integer with legacy default `1`. Migration 0010 preserves existing row values and adds a trigger preventing a later version change. New legacy orders explicitly write version 1. Internal execution versions are separate from the existing legal-policy document IDs.
- Order list/detail/create responses include `transaction_rule_version`. The existing preview/create endpoints accept an omitted version or explicit version 1; another supplied version fails validation before reserving stock/time or idempotency state. A client cannot select a new execution model by sending a version number.
- Unsupported persisted versions return `ORDER_RULE_VERSION_UNSUPPORTED` with a user-facing message. Ownership checks still precede user-command version checks. Order detail action arrays are empty for unsupported versions.
- Payment creation/replay, callbacks, mock-payment commands, order transitions, refund creation/decisions/escalation/callbacks, review creation, order jobs, and ledger income/refund/settlement paths enforce the shared guard. Failed commands roll back; unsupported callback events remain retryable rather than being recorded as processed.
- Legacy appointment, acceptance, proportional-refund accounting, and settlement behavior remain available. General support/report handling and historical read access remain separate from version-specific transaction execution.

Only version 1 has executable handlers. Test fixtures using versions 2 and 99 are deliberately unsupported; they do not define or activate a future business rule set.

## Proof

| Check | Result |
| --- | --- |
| Workspace build/type checks | PASS, including mobile types |
| API rebuild/type check after request-boundary update | PASS |
| Contracts/application/schema tests | 29 passed, 0 failed/skipped |
| Focused integration batch | 53 passed, 0 failed/skipped |
| Migration metadata and diff whitespace | PASS |
| Pre-existing workspace fingerprints | All 21 preserved except the intentional plan progress update |

The integration batch covers legacy identity/catalog/payment/order/refund/finance/messaging/account/E2E behavior; explicit unsupported-version command, job, callback and ledger rejection; request-version validation; and isolated forward/rollback/reapply behavior. Unknown-version mutations leave order facts, money, logs, jobs and outbox records unchanged. Refund rejection creates no provider calls or committed inbox claims. Migration rollback refuses to remove routing facts while a nonlegacy order exists.

M0's mobile suite remains 179 passed with lint/type checks passing. M1a did not change mobile runtime code. No native/device, browser UI, or real-provider behavior is claimed.

## Local application and rollout

Read-only preflight confirmed that only `0010_order_rule_versions` was pending in the local application database. Applied it with `corepack pnpm db:migrate`; read-only verification found no pending migrations, the rule-version column and immutable trigger installed, and 0 local orders. Staging/production were not accessed.

Before introducing another execution version:

1. Apply the additive migration and deploy guards to every API, job and finance writer that can handle orders.
2. Implement and verify the complete new-version handlers, source rules, client contract and effective-date/history policy.
3. Enable creation of new-version orders only after that rollout is complete. Never infer a version from status, product type or current platform configuration; never relabel an old order.

Pre-M1a binaries do not contain these guards. They must not be restored while nonlegacy orders exist. No claim is made that an arbitrary old binary can safely operate newer orders.

The preferred schema rollback retains the additive column while disabling creation of newer orders and running a compatible application. The manual `packages/database/migrations/rollback/0010_order_rule_versions.down.sql` takes an exclusive order-table lock and refuses nonlegacy rows; stop writers first. Its removal path was exercised only on disposable isolated fixtures.

## Remaining M1 work

- Independent fulfillment/after-sales/refund/review/funds facts and shared transition/action policy.
- Checkout/evidence snapshots, persisted counters/termination/deadline/pause facts and stale-job protection.
- Durable provider operations, reservation recovery, concurrency and mixed-version new-handler proof.
- Transaction and After-Sales Framework V3.1 J/K rules, approved effective-date/history treatment (B01/D16), and the applicable business decisions before activation.

Next slice: the confirmed direct-purchase fulfillment model and its transition policy. The missing source framework still blocks final liability/adjudication mapping; M1a does not claim AC60 or all of M1 complete.
