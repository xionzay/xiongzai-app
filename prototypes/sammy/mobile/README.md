# Sammy mobile prototype

Independent Expo project. Existing `apps/mobile` and backend projects are untouched.
Brand palette comes from https://xionzay.com/; typography uses native system fonts.
The buyer journey runs locally with saved profiles, orders and conversations. Backend and live provider integration are still pending.

From this directory:
1. `npm install` — install this project's dependencies and create its own lockfile.
2. `npm run typecheck` — verify types.
3. `npm run ios` — build and install the native iOS development app (requires Xcode).
4. On subsequent sessions, `npm start` — start Metro for the development client.

Android: `npm run android` builds and installs the development app (requires Android SDK).
This project uses a development build, not Expo Go.

The prototype must preserve the agreed business requirements. Backend integration is a separate next step.

For iOS simulator sessions, use `npm run start:simulator` to avoid VPN/proxy interface addresses. Physical devices require a reachable LAN address instead.

## Buyer workflow

Home search and filters lead to service details. **Buy now** opens a session selector with play mode, hourly price and quantity. Closing and reopening keeps the selection. Checkout then requires an in-game nickname, game ID and server, with an optional special request. Review shows the chosen service, delivery details, completion window, rules and exact total before creating an unpaid order.

Sign-in uses a Mainland China mobile number and simulated code. Registration adds display name and agreement confirmation. **Get code** exposes the local preview code `123456`; no SMS or identity request is sent. Use fictional test details, such as `Test Player` / `13800138000` / game ID `12345678`. Signing in during checkout returns to review; it does not automatically create an order or pay.

Payment offers **WeChat Pay only**. The confirmation explicitly identifies a test payment that charges no money. Xiongzai bears the transaction fee. Leaving payment retains the unpaid order. A confirmed test payment moves it to **Awaiting service**, with a deadline based on the purchased service snapshot. Unpaid cancellation needs confirmation; paid refund requests require a reason, amount and description and remain **pending**, without claiming a refund was issued.

Orders include search, status filters, saved game details, timestamps and the rules snapshot. Companion contact opens a message composer and saved conversation history; message feedback says **Saved on this device**. There are no fabricated companion replies and no live message delivery. Me provides profile editing, order/conversation counts, sign-out and language controls.

Prices are stored in integer fen and displayed with two decimals. Fixture prices differ by companion and mode; they are not a platform-wide pricing rule. There are no appointment slots or companion accept/reject steps in this direct-purchase flow. Special requests require explicit companion agreement.

## Persistence and boundaries

`expo-file-system` stores language choice and a versioned local marketplace snapshot. Profile, orders and conversation history survive JS reloads; editable checkout and message drafts remain in memory. Each phone-based test account sees its own orders and conversations. Signing out clears private drafts while retaining saved history on the device. These are synthetic local accounts, not secure production authentication.

Writes are serialized and preserve the previous valid snapshot. Recovery repairs a damaged primary from that backup; unrecoverable data blocks changes until retry instead of resetting history. Submit locks prevent repeated taps from creating duplicate actions. Failed saves retain form input for retry.

Live SMS, identity verification, WeChat Pay, backend storage, chat delivery, seller fulfillment and refund processing are not connected. Official agreement/rule versions must come from the backend before launch.

## Verification

From this directory, run `npm run typecheck` and `npm test`. The 30 domain/storage tests cover totals, limits, ownership, duplicate creation/payment, cancellation, pending refunds, snapshots, invalid saved data and interrupted-write recovery. Tests use Node's TypeScript support; use Node 22.18 or newer (verified with Node 25).

Checked on iPhone 18 Pro / iOS 27: bilingual forms, required-field errors, mode/quantity totals, retained selections, sign-in returning to review, rule confirmation, unpaid-order persistence after reload, leaving/cancelling the payment preview, payment success, deadline/details, refund validation and pending requests, message-history persistence, cancellation, profile editing and signed-out order access. Android and large-text/small-device layouts still need runtime verification.

## Animated home scene

The hero plays the user-approved Grok mascot/cloud video above separate translated text and the Explore button. The full 16:9 scene stays visible without cropping. `expo-video` plays a bundled, silent 960 × 540 H.264 clip (about 550 KB), with a short crossfade baked into its loop boundary. It needs no network download once the app assets are bundled.

Playback pauses when the app is inactive or Reduce Motion is enabled, and the player is released when leaving Home or opening service details. A still poster covers loading, playback errors, and reduced-motion states. Clouds, a floating island, and twinkling stars decorate the surrounding screen.

Me and empty states share the animated mascot, with reactions chosen by screen state: a welcoming nod for sign-in, patient thought dots for waiting, curious tilts for drafting or no results, a reassuring reaction after a failed first-message save, and a happy hop after test-payment success. The existing expression sheet and native animations respect background and Reduce Motion settings; no new native build is needed.

Installing `expo-video` requires a fresh native development build: run `npm run ios` or `npm run android` once after installing dependencies. Later visual/JS changes can use Metro as usual. Video provenance and processing are in `assets/hero-video.md`; earlier illustrated expression references remain in `assets/mascot-expressions.md`.

Video update verified on iPhone 18 Pro / iOS 27: native build/install, visible moving facial expressions, English/Chinese layout switching, Explore scrolling, service details, and switching away from Home and back without player-disposal errors. TypeScript checks pass. Android playback and the OS Reduce Motion toggle still need runtime verification.


### Separate accounts and onboarding
- First-time guests see three bilingual introduction pages with contextual mascot animation, Back/Next, account creation, sign-in and guest exploration. Completion is persisted; Me → Meet Xiongzai replays it.
- Sign-in uses phone + simulated code. Registration adds display name, optional bio and preview agreement acceptance. Tap Get code and use 123456; no SMS is sent.
- Profiles now survive sign-out in the local account directory. Duplicate registration and unknown sign-in numbers show actionable errors. Editing cannot change the account phone.
- Existing active profiles are retained on the next account mutation or sign-out. Profiles already discarded by the old sign-out implementation cannot be reconstructed; register those numbers again. Existing orders/conversations are retained.
- Typecheck and 25 domain/storage tests pass. iPhone dev-client onboarding (English/Chinese) and separate form rendering inspected; full native account submission and Android not verified in this change.


### Player and provider registration
- Signup begins with Player / Service provider cards in both languages. Sign-in remains phone + simulated SMS for the shared account.
- Players complete the account form. Providers complete Account → Game profile → Review, then create the account and save a local draft. Game profile includes nickname, ID, server, rank, K/D, experience, play style and preferred team mode.
- Me shows the provider draft, allows editing, and offers existing players a way to begin provider setup on the same account. Account/profile edits preserve the draft; existing saved accounts remain compatible.
- Identity/adult verification, voice publication authorisation, server media review, provider agreement and application review are outstanding; local avatar and voice tools are available. No application is submitted, no approved seller status is created and no live selling is enabled. Those requirements follow docs/陪玩与服务商品模块-V1.0.md.
- Typecheck and all 27 tests pass. iPhone native registration choice, provider signup through successful save with fictional data, review and Chinese Me draft card inspected. Android and real verification/media integrations remain unverified/unimplemented.


### Avatars and tab icons
- Signup and Edit Profile offer the native photo library, square crop, preview, replace and remove controls. Files up to 8 MB are copied into the app's private documents directory; profile records retain only a validated filename. Images stay local and are not uploaded or media-approved.
- expo-image-picker requires a native dev-client rebuild after installation. If an older build lacks it, the form shows an actionable message rather than loading the missing module.
- Bottom navigation now uses matching code-drawn home, receipt, conversation and profile icons with an active background and existing localized labels.
- iPhone native picker, sample-photo crop/preview/removal and tab appearance inspected. Typecheck and 28 domain/storage tests pass. Native avatar save/relaunch and Android not exercised in this change.


### Provider profile and voice introduction
- Me → View provider profile (or Start provider profile) opens a private profile with avatar, bio, game stats, saved-media checklist and draft editing. Profile-photo editing reuses the same avatar picker as registration.
- Voice introduction is available in provider signup and draft editing. Record or choose an M4A/MP3/AAC clip, preview/pause, replace or remove it, then review/save the provider draft. Actual native audio duration must be 10–30 seconds and files must be at most 10 MiB, following docs/文件存储-V1.0.md. Copies live in the app's private documents directory. Account edits and sign-out/sign-in preserve the media.
- Recording requests microphone access only on tap, stops before the 30-second cap, and stops/discards incomplete recording when the app leaves the foreground. Previous saved media is retained if a replacement is cancelled or invalid. Saving/navigation are blocked during recording or selection.
- Native dependencies: expo-audio and expo-document-picker. Audio is enabled only in the foreground; microphone permission text and both modules are included in the rebuilt iPhone development client. Older native builds show an actionable message.
- Verified: TypeScript, 30 domain/storage tests, iPhone provider layout, file-picker opening/cancellation, synthetic AAC playback with progress, native draft save and actual app restart retaining avatar/audio, and original session restoration. The synthetic account uses phone 13800138019 and nickname Voice QA.
- Not exercised: microphone capture/permission-denial/auto-stop/background behaviour on a real device, selection of an existing file in the simulator's empty Files library, or Android. Identity/adult checks, authorisation agreements, uploads/moderation and provider approval remain unconnected; nothing here publishes a provider or enables selling.
# Hosted accounts and provider review

The optional Fastify backend lives in `../backend`. Follow [the backend setup guide](../backend/README.md) for Neon, private media storage, Vercel and admin access.

Set `EXPO_PUBLIC_API_URL` in `.env.local` and restart Metro to enable phone/password sign-in and shared application review. With that variable unset, the existing local demo and its saved accounts remain available. Never put backend credentials in Expo variables.

The native development client now includes SecureStore and image conversion. Rebuild once with `npm run ios`; then use `npm run start:simulator`. That command keeps Metro's listening host and advertised bundle address consistent on Macs that resolve localhost to IPv6.

