# Sammy hosted prototype

Fastify 5 + TypeScript + Zod + Drizzle + PostgreSQL. Deploy the API and same-origin admin page on Vercel; use a dedicated Neon database and private S3-compatible media bucket (Cloudflare R2 configuration below).

Implemented: phone/password accounts, 7-day revocable sessions, profile edits, private photo/voice uploads, immutable provider application snapshots, admin approval/change requests and resubmission; provider service drafts, publication/unpublishing and public search/filter/detail pages. Mobile review state refreshes on foreground or with the refresh button.

Phone numbers are unverified sign-in names. This slice does not implement SMS, password recovery, identity verification, payments, orders or chat. Approval does not publish a service. The admin list shows the newest 100 applications for the selected status.

## 1. Configure the database and media

Create a **dedicated** Neon database/branch for Sammy. The migration uses names such as `users` and `sessions`; do not target the company database. Copy the pooled connection string and keep TLS certificate verification enabled (`sslmode=verify-full`).

Create a private R2 bucket and an API token restricted to reading/writing that bucket. Leave public access disabled. The application uploads directly to a five-minute signed URL, validates the stored bytes, then saves a separate immutable object. Audio must be 10–30 seconds, up to 10 MB; photos are JPEG/PNG/WebP, up to 8 MB. The mobile client converts HEIC to JPEG. Signed download links also expire after five minutes; refresh the admin page to renew them.

Configure a bucket lifecycle rule to expire only `incoming/` objects after one day (abandoned uploads). Do not expire `verified/` objects; they may belong to submitted applications. Native mobile uploads do not need browser CORS. If the admin browser cannot play audio, permit GET/HEAD from the exact admin origin in bucket CORS.

```sh
cd /Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/prototypes/sammy/backend
cp .env.example .env
```

Fill the values in `.env` locally. Do not paste passwords into chat or commit this file. Missing storage configuration allows accounts but returns an explicit error for uploads.

## 2. Run locally

Use Node 22.18 or newer in the Node 22 line.

```sh
npm ci --workspaces=false
npm run db:migrate
npm run dev
```

Expected: API on `http://127.0.0.1:3100`, health at `/health`, admin at `/admin`. The migration is transactional and repeatable. Local listening is restricted to loopback; use the hosted HTTPS API for a physical phone.

## 3. Connect the mobile development client

In `prototypes/sammy/mobile/.env.local` set only this public address:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:3100
```

Restart Metro. The existing development client needs rebuilding once for SecureStore and image conversion:

```sh
cd /Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/prototypes/sammy/mobile
npm run ios
# For subsequent simulator sessions:
npm run start:simulator
```

Create a new account in hosted mode. Local demo phone accounts are not automatically imported, and code `123456` cannot authenticate remote accounts. The password needs 12–128 characters. Tokens are stored in the device Keychain/SecureStore and scoped to the API address; passwords are not persisted by the client.

Your existing local JSON snapshots are untouched. Removing `EXPO_PUBLIC_API_URL` and restarting Metro returns to the local demo. Hosted mode keeps orders/payments/chat unavailable. If registration succeeds but media fails, the account remains signed in; reopen the profile and select the missing media again.

## 4. Grant admin access

Register a separate account you control through the app, then run this against the intended database, replacing the sample phone:

```sh
cd /Users/codecrafterx/Desktop/MOBILE-DEV-PROJECTS/xiongzai-app/prototypes/sammy/backend
npm run admin:grant -- 13800138000
```

Open `/admin`, sign in, choose an application, inspect the submitted photo/voice and either approve or request changes with a reason. The browser holds its token only in memory; refreshing the page requires signing in again. An admin cannot review their own application. Do not grant roles to accounts you have not verified you control.

## 5. Deploy on Vercel

1. Import the company repository and select **Root Directory: `prototypes/sammy/backend`**, framework **Other**, Node **22.x**. Install command: `npm ci --workspaces=false`; build command: `npm run build`; leave output directory unset. The included `vercel.json` routes requests to `api/index.ts` and includes admin assets.
2. Add `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` as server environment variables. Use a separate Neon branch/bucket for previews to prevent testing against production data.
3. Run `npm run db:migrate` locally with that environment before directing clients to it. Migrations do not run automatically at function startup.
4. Deploy. Check `/health` and `/admin`, then register a synthetic test account. Vercel preview protection can block native API requests; use a reachable deployment URL for the prototype without putting Vercel bypass secrets in the mobile app.
5. Set `EXPO_PUBLIC_API_URL=https://YOUR-DEPLOYMENT.vercel.app` in the mobile environment and restart Metro. Never put database or storage credentials in Expo variables.
6. Exercise the full path: register → upload photo/voice → save provider profile → consent/submit → separate admin requests changes → refresh app → edit/resubmit → admin approves → refresh app. Check logout and later sign-in restore the account.

Deployment and real R2 uploads still need verification with the actual account configuration. Local integration tests use a real disposable PostgreSQL database and an in-memory object-store test double, including actual image/audio bytes.

## Checks and rollback

```sh
npm run typecheck
npm run build
npm run test:integration
```

The integration runner uses PostgreSQL 16 binaries from Homebrew by default. Override `PGBIN` if necessary. It creates a temporary socket-only database and stops it on exit; it never reads your production `DATABASE_URL`. The generated silent 12-second M4A fixture is synthetic.

For a rollback, remove the mobile API variable and restart Metro; existing local accounts return. Roll back the Vercel deployment if needed. Preserve the Neon database and private media; do not drop tables or delete submitted media to roll back application code.


## Local preview before deployment

Run `node scripts/local-stack.mjs` from this backend directory. It uses the existing repository MinIO binary at `.local/minio/bin/minio` and PostgreSQL 16 at `/opt/homebrew/opt/postgresql@16/bin` (override `PGBIN` if needed). It starts a separate persistent database and media store and serves the API/admin on `http://127.0.0.1:3100`. It does not read the company database credentials. Data is stored beneath `backend/.local/data-*`; restarting reuses the selected data and media, including accounts, sessions and review history. Stop with Ctrl-C. On the first restart after upgrading, the launcher copies a previous stopped temporary database and media directory into this persistent location and retains the original files. It refuses to start while ports 3100/9410/9411 or the selected PostgreSQL are already in use. It never stops a stack owned by another launch. The PostgreSQL socket remains in a short temporary path; the database files are persistent.

To select an empty local stack explicitly, run `node scripts/local-stack.mjs --reset` after stopping the current stack. Existing data directories are retained; `.local/stack.json` records the selected directory and local storage credential (do not share it). Back up the complete selected data directory and `.local/stack.json` while the stack is stopped. Do not remove `.local` unless you intend to discard local data.

From a second backend terminal, `node --env-file=.local/runtime.env scripts/walkthrough.mjs` verifies real uploads, browser review, changes/resubmission/approval, publication, search/detail and unpublish. It uses the repository's existing Playwright installation and installed Google Chrome. Synthetic test users and media are created only on this local stack. No deployment is required.

For a separate backend-connected mobile preview, run this from `../mobile`:

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:3100 REACT_NATIVE_PACKAGER_HOSTNAME=localhost npx expo start --dev-client --localhost --port 8083
```

Use that server in the development client. The ordinary demo session on port 8081 remains separate. With this prototype, services cover Peace Elite and hourly pricing. Provider-written titles/descriptions remain in their original language; surrounding UI supports English and Chinese.

Publication requires provider approval and explicit consent to expose the selected listing photos and approved profile photo/voice/name/bio. Phone and in-game identifiers remain private. Drafts are never returned by public endpoints. Editing published content returns it to draft; re-publishing requires consent. Concurrent stale edits return a conflict rather than overwriting newer data. Unpublishing removes public API access immediately; already issued media links can remain valid for their five-minute lifetime. These discovery features do not enable payments or replace identity checks.

Migration `0002` adds listings without rewriting accounts or submitted applications. Roll back app code if needed while preserving both migrations and their data; do not drop the new table as an application rollback.

## Administration workspace

1. After stopping the old stack with Ctrl-C in its terminal, run `node scripts/local-stack.mjs` from this backend directory. The launcher preserves prior local data, runs additive migrations and starts the updated API. Never run `--reset` to upgrade existing data.
2. Open `http://127.0.0.1:3100/admin` and sign in with an account already granted administrator access. Use the language menu for Chinese or English. Sessions remain in browser memory only.
3. Overview shows current database totals; Users and Providers support search, profile inspection, suspension and reactivation with a required reason. Administrator accounts are protected from suspension. Provider suspension removes publishing access while preserving account access. Account suspension blocks new purchases/payments and ordinary writes; the order slice below retains restricted sign-in, profile/order reads and eligible unpaid cancellation.
4. Applications preserves the submitted photo/voice review workflow. Services shows listings and allows revision-checked block/restore with a reason. A block survives owner edits and unpublish/publish attempts; restoring can immediately reveal an already published service if its account and provider are active.
5. Action history records application decisions, account/provider state changes, and service moderation atomically with the mutation. It contains reasons and actor identity, never passwords or session tokens.
6. Verify backend changes with `npm run typecheck`, `npm run build`, and `npm run test:integration`. The integration suite uses its own temporary PostgreSQL; it does not mutate the running workspace database.

User/provider/service/history lists show 30 records per page. Application review retains the existing latest-100-per-status list. User inspection shows the latest 30 applications and up to 50 services (the owner listing limit). The later simulated-order slice adds read-only order inspection; finance and dispute administration remain unavailable.

## Persisted orders and simulated checkout (21 October 2026)

This slice stores orders and payment test attempts in PostgreSQL. It is **not real commerce**: WeChat Pay, identity/adult checks, fulfillment, refunds, ledger, settlement, inventory/capacity reservation and deadlines remain unavailable. Order rules are labeled `sammy-simulation-v1`; the V3.1 reference does not assert complete V3.1 compliance. No appointment or seller accept/reject-order step exists.

1. Stop the existing local stack with Ctrl-C and run `node scripts/local-stack.mjs` from this backend directory. Do not pass `--reset`. The launcher preserves local data, applies additive migration `0004`, and explicitly sets `SAMMY_SIMULATED_PAYMENTS=true` for this local test stack.
2. Restart/reload the Expo development app pointing at this API. Open a real published service, choose quantity, complete game delivery details, and accept the displayed simulation rules. The actual listing mode is fixed. The 1–24 hour cap is an explicit prototype test constraint, not PRD inventory/capacity policy.
3. Submit to create an unpaid order. The server calculates integer-fen totals from the current listing, checks quote revision/price and participant eligibility, and stores service, rules and delivery snapshots. Reusing the buyer request ID returns the same order; changing its payload returns a conflict. Later listing edits do not replace snapshots.
4. In checkout, choose simulated success, failure or pending. These choices call a dedicated test endpoint; the ordinary app cannot claim a real channel payment result. A pending attempt is queryable and blocks cancellation/another attempt until the same attempt resolves. Success becomes awaiting service; failure remains unpaid and can be retried. No payment expiry or fulfillment deadline is invented.
5. Orders shows My purchases / My sales, saved details and payment state. Search applies to loaded records; load more retrieves another page. Only buyers can cancel their own unpaid orders without pending payment or run simulated payment. Sellers inspect their received orders. Admin Orders provides read-only inspection of stored snapshots and attempts.
6. Restricted accounts can sign in, read their profile/existing orders and cancel eligible unpaid orders; normal profile/listing writes, new purchases and payments remain blocked. A restricted buyer can resolve an existing pending simulation as failed, then cancel. Suspended administrators remain denied. Existing-order fulfillment/support/appeals are future work, not represented as implemented.

`SAMMY_SIMULATED_PAYMENTS` must be exactly `true` to create orders or simulate payment. Local production execution remains blocked. Vercel simulation requires all three explicit values: `VERCEL=1`, `VERCEL_ENV=preview` (provided by Vercel), and `SAMMY_HOSTED_DEMO=true`. Configure both Sammy flags only in the Preview environment, with a dedicated test Neon branch and private test bucket. Production, missing or unknown Vercel targets remain blocked even when both flags are enabled. Leave `SAMMY_HOSTED_DEMO` unset locally. This enables simulated money only; hosted scheduling and an end-to-end deployment walkthrough are separate readiness requirements. `.env.example` defaults it off. Reads/cancellation of existing records remain available when disabled. Never enable this prototype as real payment handling.

Focused verification: `npm run test:integration` creates a separate PostgreSQL database; it covers immutable API snapshots, create/payment idempotency, pending persistence across app instances, ownership, restrictions and concurrent pay/cancel. Mobile `npm run typecheck` and `npm test` cover mapping and existing local behavior. Native iOS/Android checkout and real payment are not established by these checks.

Migration rollback: stop writers and revert application code while retaining additive tables/columns. Keep migration `0004` recorded and preserve order/payment rows; no destructive down migration or automatic conversion of existing orders is supplied. Production activation requires a separate confirmed design and acceptance pass.

## Remaining transaction, funds and assistance simulation (22 October 2026)

This stage adds working persisted prototype flows to the preceding checkout slice. Earlier dated limitations above describe their historical stage; the routes below now implement fulfillment/acceptance, after-sales, simulated refunds, seller funds, withdrawals, conversations/cards, in-app notifications, support and independent feedback. They remain simulations, not a claim of full V3.1/PRD compliance or production readiness.

### Start and roles

1. Stop the existing local stack with Ctrl-C; restart with `node scripts/local-stack.mjs` from this backend directory. **Do not use `--reset`.** Additive migration `0005` preserves orders/rule snapshots, backfills paid-order workflows and unsettled ledger entries, and creates append-only histories, durable jobs and assistance records.
2. Use an approved seller and a separate buyer. Existing restricted participants may fulfill and seek assistance on their existing orders; creating purchases/listings and applying for withdrawals remain restricted. Administrative accounts cannot self-suspend.
3. Ordinary staff uses the existing admin grant. Higher refund rulings require the explicit supervisor test role: after registering the account, run `node --env-file=.local/runtime.env --import tsx scripts/grant-admin.ts PHONE --supervisor`. A second and third distinct reviewer are needed to exercise both appeal levels. This command changes only the specified local account; it does not perform real identity or staff verification.
4. New orders accept `sammy-simulation-v2` rules. Existing orders keep their original snapshots and exact prior create retries remain idempotent. No appointment, seller order acceptance, unpaid expiry or invented initial fulfillment deadline is introduced.

### Fulfillment, evidence and clocks

Seller Start Service is followed by Submit Completion. Every completion needs at least five verified image uploads; amount paid **RMB 200 or more** additionally requires an MP4 with a real video track and the seller's continuous-recording attestation. The prototype permits JPEG/PNG/WebP up to 8 MB each and MP4 up to 50 MB; these are test upload safeguards, not finalized D13 production parameters. Format/track checks do not prove authenticity or continuity. Duplicate/reused content enters a staff evidence-review lane and does not start acceptance until reviewed and resubmitted. Original files/references cannot be replaced; append does not reset acceptance.

Completion starts 72-hour acceptance. The buyer has one optional 24-hour extension shared with supplementary fulfillment. Manual confirmation or a valid due job settles the order. Starting, completion, confirmation and after-sales use participant locks and workflow versions; stale actions fail with a refresh requirement.

Original evidence access is limited to its owner and staff and is audited. A counterparty receives only a reviewed redacted derivative. Staff uploads that derivative through the existing validated media pipeline, then maps it using `POST /v1/admin/orders/:id/evidence/:mediaId/redact` with `redactedMediaId`, `requestId` and `reason`. Access remains unavailable until that mapping exists; originals are not made public to work around it. Signed links expire after five minutes. No evidence or message deletion endpoint is provided; production three-year retention, legal holds and eventual deletion/anonymization need finalized policy and operational verification.

`src/local.ts` runs durable due jobs every 30 seconds while the local simulator is enabled. Missed jobs remain in PostgreSQL across restarts and are processed once. Staff may run due jobs in the admin queue; a scheduler can invoke `node --env-file=.local/runtime.env --import tsx scripts/run-commerce-jobs.ts`. Hosted scheduling must actually be configured and monitored separately; a Preview API alone does not establish a working scheduler. The worker never invents a liability decision: overdue platform reviews remain flagged, retain their freezes, notify participants and remain in the staff queue.

### After-sales and appeals

An ordinary request has a positive remaining-refundable amount and reason; initial evidence and description are optional. It freezes the whole order and pauses normal fulfillment/acceptance. Three self-service cases, two edits per case, two pre-intervention proposal rounds and server-owned deadlines persist across login/restart. Staff can open a verified support case after self-service attempts are exhausted without pretending a feedback message is an after-sales request.

Seller agreement or 24-hour S01 silence creates **Pending Execution**, not a successful refund. Rejection needs a reason and evidence and starts the 48-hour intervention window. Versioned refund-and-close proposals preserve acknowledged delivery, actual-cost basis, retained amount and terminated obligations; supplementary proposals preserve the exact agreed scope and deadline (at most seven days). Explicit acceptance of that version is required. First proposal rejection/expiry starts the second-proposal wait; another expiry/rejection routes to staff, never an automatic full refund.

Supplementary completion has the same evidence thresholds and a fresh 72-hour acceptance clock. A disputed R02 stays associated with the original case and freeze. Denial restores R02 with at least 24 hours; a denied R01 dispute requires an explicit new continuation deadline instead of silently dropping agreed obligations.

Staff rulings contain findings, evidence summary, rule reference, reasoning, refund amount and remaining obligations. Ordinary support cannot approve more than RMB 100 per case; higher rulings require the supervisor test role. Two appeal levels use distinct reviewers; the second appeal needs new evidence. Initial/first-review rulings have a 24-hour response window; both parties may accept the current version early. Appeals cancel obsolete execution jobs. A final second-review result has no third internal appeal.

Post-termination special claims originate from a buyer's order support ticket. Eligibility uses that ticket's first in-window contact (seven days from first termination), even if staff opens the case later. They freeze the claim amount, not a new ordinary case, and never gain a seller-silence refund. Generic support/reporting stays available when monetary claims are no longer eligible. **The referenced original V3.1 J01–J20 liability framework was not supplied. The software records human decisions and agreed outcomes; it does not fabricate fault percentages, statutory judgments, advances or guaranteed compensation.**

### Simulated refunds and finance

Mutual agreements need no extra policy approval; staff controls only the simulated external-channel dispatch/result. Pending Execution, Processing, Successful and Failed Under Investigation are distinct. Unknown/failed attempts retain their original refund reference; only confirmed simulated success posts a refund. Cumulative refunds cannot exceed payment. Insufficient recoverable funds retain Pending Execution for collection/staff handling; no fake Processing/receipt status is shown.

All money is integer fen. With no genuine simulated order refund, commission is 10%, half-up to one fen. Any successful order refund makes commission zero and final entitlement `payment - cumulative refunds`. Earlier commission/settlement entries are retained; reversal/adjustment entries are appended. Channel fees are borne by the company. No buyer stored-value wallet or deposit is introduced.

The ledger separates unsettled, available, frozen, withdrawal-reserved and commission changes. Case/risk freezes are independently referenced; overlapping holds on the same order pool do not inflate balances, and releasing a case does not release risk holds. A negative available position is shown as debt/funding shortfall and blocks new spending. No unconfirmed repayment channel or standard advance is invented.

Approved sellers can create a **synthetic label only** for payout testing. Staff marks it as a verified test fixture; this is not real same-name verification or KYC. Withdrawal acceptance atomically reserves available funds. Only staff's simulated channel result can succeed/fail it, and a confirmed failure releases its reservation. Processing/uncertainty never releases funds to create another payout. Changed destination records do not replace the snapshot of a pending withdrawal. D10's real minimum/limits/accounts/arrival wording still need confirmation; the API's positive-fen/32-bit-entry bounds are technical prototype safeguards.

### Messages, notices, support and feedback

Messages are persisted, private to the conversation's buyer/seller pair, and deduplicated by sender/request key. Product/order cards are authorized against that same pair on send and open. Original messages are preserved. The app supports explicit refresh and older-record loading; real-time delivery and external push are not claimed.

In-app notifications persist their read state and authorized target. Repeated workflow, message and ticket operations create one deduplicated notice. Reading/opening a notice does not change the business state. Support tickets are created only after submission, carry the selected order where applicable, and retain user follow-ups, staff replies and closure. Feedback is a separate Submitted/In Progress/Replied record; it never opens a refund case, consumes case attempts, freezes money or pauses clocks.

Mobile Orders provides progress and capability-checked forms. Messages includes conversations, notifications, support, feedback and funds; My Account also links to earnings/withdrawals. Admin queues provide cases, evidence review/redaction, rulings/refund simulation, payout testing, withdrawals, tickets, ledger and jobs. All new UI has Chinese/English copy.

### Verification and remaining production boundaries

Run backend `npm run build`, `npm run typecheck` and `npm run test:integration`. The database suite is isolated from the running local stack and covers thresholds, duplicate evidence, 72-hour jobs/idempotency, extension exhaustion, risk hold preservation, supplementary restoration, independent appeal levels/new evidence, commission reversal, withdrawal races, private cards, redacted access and separate feedback notices. Mobile `npm run typecheck`, `npm test`, and an iOS Expo export check the compiled application; they do **not** establish native interactive acceptance.

Real payment/refund/payout providers, verified identity/adult/same-name checks, push, the secure game-credential channel, full original liability rules and approvals, production retention/deletion, monitored hosted scheduling, operational reconciliation, and actual iOS/Android end-to-end acceptance remain external release gates. Categories requiring encrypted game credentials stay unsupported. Existing rollback guidance remains additive: stop writers/revert application code while retaining tables, migration records and histories; never reset/drop financial evidence to roll back this prototype.

## Device and sample data import

Migration `0006` adds the private `local_data_imports` provenance/archive table; no API exposes it. `scripts/import-local-data.mjs` reads a preserved `marketplace-v1.json` and the mobile app's existing sample catalogue. Run with `node --import tsx --env-file=.env.local scripts/import-local-data.mjs PATH` to preview, then add `--apply` to import. All inserts commit in one transaction. Stable IDs and source hashes make reruns skip identical imports and reject changed sources; existing accounts/services are never overwritten or merged by phone.

Device accounts retain validated profile/provider fields. Generated passwords are saved only in ignored `.local/imports/account-passwords.json` with permissions `0600`; sample-provider identities use non-login phone placeholders and random discarded passwords. No administrator roles, review approvals, or publication consent are granted. Six sample services preserve both play modes and original prices, with bilingual copy, as drafts. Completing media upload and hosted review remains required before publication.

The private source snapshot preserves original local applications, avatar/voice file references, orders, and conversations. Legacy orders are historical source data, not active hosted orders or ledger entries. Device-local media still needs uploading to configured private storage. The simulator data and local PostgreSQL were preserved; the import does not copy local admin privileges, sessions, or test credentials. If a transaction fails it rolls back; after a successful import, keep provenance/source backups and review dependencies before any rollback deletion. Do not reset either database as a rollback.

## Cloudinary Free storage

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in ignored backend `.env.local`; the commented template is also in `.env.example`. Preserve Neon variables. All three values are required. Cloudinary takes precedence over S3 when configured; the local MinIO stack continues using S3 when Cloudinary is absent. Existing objects are not automatically copied between providers. No Cloudinary secret belongs in the mobile app or `EXPO_PUBLIC_*` variables.

New media uploads use server-signed multipart POSTs directly to Cloudinary. Avatar/voice and evidence uploads share the mobile transport; existing S3 binary PUT slots still work. The server reads the uploaded bytes, verifies type/size/duration, and writes an immutable verified copy before marking media ready. All assets use raw authenticated storage to preserve original bytes. There are no unsigned upload presets or public CDN links. Downloads use the authenticated API with a five-minute expiry; Cloudinary documents extra bandwidth usage for these downloads, so monitor the free allowance, particularly for recordings. No paid Cloudinary feature is configured by this implementation.

After configuring credentials, run `npm run storage:check`. It starts a temporary local HTTP API against configured Neon, creates one synthetic account, uploads actual PNG/M4A/MP4 fixtures, finalizes each media kind, verifies identical bytes and denied unsigned/expired access, and removes only its own test assets/records. It never prints credentials or signed URLs. If asset cleanup fails, records remain available for cleanup. This test proves provider integration; it does not prove native-device playback or hosted Vercel behavior. Native and hosted walkthroughs remain deployment checks.

### Transfer preserved device media

`node --import tsx --env-file=.env.local scripts/import-local-media.mjs /ABSOLUTE/SIMULATOR/Documents` previews files referenced by the `device-v1` archive; add `--apply` to transfer. It validates local file bytes, uploads through authenticated media endpoints, verifies Cloudinary bytes, and links current avatars/voice IDs in one database transaction. Local originals remain intact. Source application media references are retained in `local_data_imports` (`device-media-v1`); this does not create hosted consent, approval, or publication. Existing profile media cannot be replaced. Repeated imports skip a completed unchanged source; interrupted runs reuse ready files by owner/kind/content hash. Failed uploads can leave pending media records for cleanup; never delete source files as rollback. Three files were transferred: a provider photo/voice pair and one player avatar. The other provider currently has no saved photo or voice recording.
