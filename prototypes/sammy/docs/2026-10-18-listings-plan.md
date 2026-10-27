# Provider dashboard and listings implementation plan

Approved scope: the user accepted the proposed local walkthrough, provider dashboard, service listing management, database browsing and state handling. This extends the isolated Sammy prototype only.

Design: keep Fastify/PostgreSQL and the existing native forms. Providers can save complete listing drafts with a game, title, description, session mode, category, hourly price and up to four photos. Publication requires an approved provider application plus explicit public-media consent. Public provider details come from the approved application snapshot, never unreviewed edits; private phone/game IDs and admin notes are excluded. Saving edits returns a published listing to draft so changed content requires another explicit publish. Unpublish hides the listing immediately. User-created text stays in its original language; UI controls remain English/Chinese.

This is discovery in a prototype, not identity verification or enabled checkout. Orders, payments and chat remain unavailable. Demo-mode data remains isolated; database browsing is enabled only with the API URL.

- [x] Run an isolated PostgreSQL + MinIO stack and exercise actual HTTP uploads and browser-admin changes/approval using synthetic users.
- [x] Add migration 0002, validated listing endpoints, ownership checks, approval/consent gates, revision conflict protection, public whitelisted responses, bounded search/filter pagination and tests.
- [x] Extend mobile account hook with owner listings, reuse upload helpers, add dashboard/editor/publish consent and loading/retry states.
- [x] Use database discovery/detail screens in API mode; preserve demo browsing in local mode.
- [x] Verify backend integration, mobile types/domain tests, browser review and simulator rendering; report any native interaction boundary honestly.

Files: backend/src/listings.ts owns listing rules/routes; schema and migrations own persistence. mobile/src/features/marketplace/ListingScreens.tsx owns owner forms; HostedDiscovery.tsx owns public discovery/detail. Existing useHostedMarketplace owns authenticated mutations. No new paid services, no production credentials, no deployment.

Verification boundary: real HTTP + MinIO uploads, browser admin audio/review and listing publication/discovery were exercised. The backend-connected iOS app renders. Device Hub exposed no automation windows and the native debugger returned 401, so interactive native form verification remains manual.
