# Fastify hosted prototype implementation plan

Goal: accounts and provider review shared between the mobile app and an authenticated admin page.
Approved stack: TypeScript, Fastify, Zod, Drizzle, Neon PostgreSQL, Vercel; phone/password authentication.
Isolation: all changes stay in prototypes/sammy. Existing local snapshots remain available when EXPO_PUBLIC_API_URL is unset. No automatic import of unverified local phone accounts.

1. Backend schema and security tests: PostgreSQL users, hashed sessions, upload records, immutable application snapshots and database-backed rate limiting. Reject client-assigned admin roles, foreign media, invalid transitions and duplicate reviews. Only admin CLI can grant review access.
2. Fastify API: registration/login/logout, account retrieval/edit, presigned private S3-compatible media uploads, submission, admin list/detail/review. Zod checks input; PostgreSQL transactions serialize application revisions. Use scrypt passwords and opaque revocable sessions. No public SMS test code. Phone number is an unverified username until SMS is integrated.
3. Media: private R2/S3 bucket, direct upload avoids Vercel request-body limits. Server validates file contents and audio duration, then writes a separate immutable object. Signed reads expire. Missing storage configuration fails explicitly.
4. Admin page: same-origin HTML/JS, session token held only in memory, sign-in, pending applications, media review and approve/request-changes. No user-provided HTML insertion.
5. Mobile: opt-in API URL, phone/password inputs, secure token storage, hydrate private media into local files, server-owned application states. Keep existing local demo data isolated. Orders/payments/chat remain outside this first hosted slice and report unavailable in hosted mode.
6. Verification: isolated local PostgreSQL; Fastify injection tests cover auth, ownership, consent, snapshot persistence, resubmission and concurrent review. Run backend typecheck/build, mobile typecheck/domain tests. Live Neon/Vercel/R2 deployment requires account access and environment variables; report this boundary honestly.

Deployment: Vercel project root prototypes/sammy/backend, Node 22; Neon pooled DATABASE_URL; R2 endpoint/bucket/key/secret. Run migration explicitly before traffic. Bootstrap admin by account phone via server-only CLI. Never put database or object-store credentials in Expo variables.
