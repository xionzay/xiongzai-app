# Connected prototype QA — 25 October 2026

Scope: `prototypes/sammy` only. Installed iOS development client in Device Hub's iPhone 18 Pro (iOS 27), local Metro on 8082, local Fastify on 3100, hosted Neon and private Cloudinary media. No deployment or real payment was performed. No product source code was changed during this walkthrough.

## Passed in the actual iOS app

| Check | Observed result |
| --- | --- |
| Chinese → English | Onboarding labels and copy changed. English persisted after cold restart. |
| Imported provider sign-in | Phone/password login restored the hosted provider profile. |
| Imported media | Provider media checklist showed saved photo and voice. Native voice playback advanced from 0:00 to 0:12 and ended. Audio quality was not judged. |
| Provider submission | Review showed saved fields/media and consent; submission changed status to Pending review. |
| Save provider service | Created `iOS QA companion session`, squad/casual, ¥39/hour. One draft appeared; publishing was disabled before approval. |
| Profile persistence | Saved a temporary bio suffix; it survived a cold app restart. Session also survived. |
| Submitted snapshot | Separate Neon check confirmed the submitted bio did not change when the current profile was edited. Original bio was restored afterward. |
| Approval propagation | App showed Application approved after real browser-admin review. Publication became available. |
| Publication | Normal confirmation published the synthetic service; provider counts changed to one published, zero drafts. |
| Sign-out and account switching | Sign-out returned to signed-out Me. Separate imported player login restored its own account. |
| Buyer discovery/detail | Buyer saw the published test service, exact price, provider copy, and public media controls. |
| Checkout validation | Empty nickname/game ID/server produced field errors. Synthetic game details allowed review and order creation. |
| Simulated payment failure/retry | Failure left the same order payable. Retry success showed the success page and paid order details. No WeChat launch or real money. |
| Order conversation | Contact-other-party opened private chat. Synthetic buyer message appeared with sender/time after sending. |
| Support submission | Empty support form had Submit disabled. Filled synthetic issue persisted and could be opened again. |

## Passed in the real browser admin

- Temporary reviewer signed in; English admin interface loaded.
- Submitted provider photo loaded at 256 × 256; submitted voice control and original profile snapshot were present.
- Reviewer approved the synthetic provider with an explicit QA note; approved queue and native account agreed.
- Synthetic support issue appeared, staff reply saved, and status changed to Replied.
- Paid order showed both the failed and successful attempts, ¥39 total, Awaiting service, ¥39 unsettled, and zero available/commission/refund.
- Admin signed out at the end. Temporary reviewer privileges and all its sessions were revoked in Neon; the reviewer identity remains only to preserve audit references.

Evidence: [approved application](../backend/.local/ios-qa/admin-approved.png), [paid order in admin](../backend/.local/ios-qa/admin-order-paid.png), [native paid order](../backend/.local/ios-qa/ios-order-paid.png). Screenshots are ignored local artifacts.

## Automated/API proof

- Backend isolated PostgreSQL integration: **15/15 passed**.
- Backend `npm run build`: passed.
- Mobile `npm run typecheck`: passed; unit tests **38/38 passed**.
- Neon verification of the native order: exactly one failed and one successful attempt; one ledger entry totaling 3900 fen unsettled; no available earnings or commission yet.
- Ticket owner API retrieved the official reply; a support-reply notification persisted. Receipt in the native provider notification/support screen was not separately exercised after sending the reply.

## Findings and remaining engineering

1. **Navigation defect:** opening Earnings, withdrawals & support from Me enters a routed account-services screen with no visible Back control or bottom tabs. Relaunching was needed to leave it. `HostedCommunity` has no back callback in `CommerceScreens.tsx` and its routed use in `PrototypeApp.tsx` does not supply one.
2. **Hosted copy is inconsistent:** sign-in describes accounts as saved on this device; sign-out describes local retained history; provider copy says services are unconnected even while hosted review/publication works. Payment's entry button says Pay with WeChat Pay although it opens a simulator (surrounding simulation warnings are clear).
3. **Runtime configuration:** the existing server initially had simulation disabled, which also blocked support writes. Added `SAMMY_SIMULATED_PAYMENTS=true` to ignored backend `.env.local`, restarted only the verified Sammy watcher, and confirmed the policy reports enabled. Production/Vercel safeguards were not relaxed.
4. **Deployment is still pending:** hosted scheduling, admin private evidence/redaction completion, Vercel configuration and a hosted walkthrough remain separate engineering work. This session does not certify deployment readiness.

## Remaining manual/native checks

- Real-device photo chooser, camera/microphone permissions where applicable, fresh native uploads, audio quality, background/foreground behavior, and layout on different phone sizes. This walkthrough used imported media.
- Full native seller start → five-image completion evidence (plus recording for ≥¥200) → buyer acceptance; refresh across separate devices/accounts.
- Native refunds/negotiations, both appeal levels, reviewed redacted evidence, and simulated withdrawal outcomes. Backend regression tests exercise domain behavior; this does not prove every native form.
- Read the official support reply/notification in the provider's iOS account; test feedback separately.
- Chinese layouts throughout the longer forms and subjective animation/design quality.
- Hosted/network interruption behavior after deployment. Local cold-restart persistence passed; that is not an offline/retry test.

## Test state left for continuation

- Provider: imported **Voice QA**; approved for the prototype.
- Listing: **iOS QA companion session**, published at ¥39/hour (synthetic).
- Buyer: imported **Sammy**; left signed in on the paid test order.
- Order: `2a2ffbd8-d272-4997-89cd-43b81e5dff6f`, Awaiting service, simulated paid ¥39.
- Support: one clearly labelled synthetic QA issue with a staff reply.
- Chat: one clearly labelled synthetic buyer message to the provider.
- Existing generated account passwords remain in ignored `backend/.local/imports/account-passwords.json`; none are included in this report.
- Local originals, archived local history and existing seeded service drafts were retained. No real KYC, real payment or real payout was used.

## Follow-up: customer-facing copy

English/Chinese mobile and admin copy was revised to remove developer framing, raw customer-visible version labels and stale local-storage claims. Financial controls retain explicit simulation actions and concise no-real-charge/transfer notices. The generated QA service was subsequently unpublished (retained as a draft) so it no longer appears in public discovery. The paid QA order and its immutable historical content remain saved. Native app branding is now configured as 熊崽电竞; the installed icon label takes effect on the next development build.
