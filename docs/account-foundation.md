# Account foundation — implementation milestone

24 September 2026. Development branch: `codex/account-foundation`. This implements the first part of M2 in the [production plan](production-requirements-plan.md); it is not the completed marketplace or a replacement release for the phone.

## Implemented

- Additive D1 migration and matching Drizzle schema/snapshot: users, OTP challenges, sessions, recycler organizations/facilities, versioned catalogue, private files, draft lots/items, command receipts and audit records. Existing workspace data is untouched.
- Existing 20 broad and 106 detailed labels copied into the catalogue migration. No image descriptions were regenerated and no paid AI calls were made for this work.
- Mobile verification adapter using Twilio Verify, with bounded request bodies, provider timeouts, per-phone/IP/global limits, challenge expiry/attempt limits and single-use session creation. There is no deployed test OTP or public account-role override.
- Server-issued role, owner-scoped API responses, unverified recycler onboarding, hashed expiring session tokens, profile version checks, and session revocation.
- Owner-scoped private photo upload/read with consistent 2 MiB limits, JPEG/PNG structure/dimension checks, content hashes, immutable file references and a 100 MiB/500-file per-account allowance. This is structural validation, not a malware scan or full image decode service.
- Draft lots stored as relational rows and material lines, with exact grams/whole-piece quantities and catalogue foreign keys. Repeated commands replay their receipt; stale updates preserve the winner's complete record.
- Native Android sign-in, profile, collector draft editor, camera/gallery, private photos, local SQLite records and encrypted sessions. Text edits persist locally; interrupted save commands retain their identifier across restart. Drafts/photos are account-scoped.
- Manual sync plus retry of already-queued actions after sign-in/restart. Stale drafts can be preserved as a separate local copy; cloud updates are not silently overwritten. Offline logout clears local sign-in and stores an encrypted revocation retry.

The recycler foundation currently exposes its account/profile; portfolio, shared orders, logistics and settlement interfaces are subsequent milestones. Gemini remains in the existing demo flow and is not yet connected to the new personal-account drafts. Language preference is stored; translation of the new screens remains M6. Legacy workspace/local drafts are deliberately not assigned to an individual account without a migration/ownership decision.

## Build and activation boundary

The existing Android entry flow remains the default. The new native account entry uses:

```sh
cd native-android
./gradlew assembleDebug assembleDebugAndroidTest -PaccountFoundation=true -PaccountApiOrigin=https://YOUR-STAGING-WORKER.workers.dev
```

The server's new `/api/v1/` API is disabled unless `ACCOUNTS_ENABLED` is exactly `true`. Its capability endpoint is readable while disabled. Account-enabled servers reject the old shared-workspace endpoints with an update-required response; the current live server remains in legacy mode. Pairing codes cannot authenticate personal accounts.

Prepare a separate staging Worker, D1 database and private R2 bucket before enabling this mode. Apply the checked-in migrations to staging only; set the D1 binding to `DB` and the private bucket binding to `ACCOUNT_BUCKET`. Do not add the account bucket to a public file route. The existing legacy bucket fallback is not used by personal-account file routes.

Required runtime configuration:

| Name | Storage | Purpose |
|---|---|---|
| `ACCOUNTS_ENABLED` | Worker variable | Explicitly enable the personal-account API after migration/configuration |
| `AUTH_RATE_SECRET` | Worker secret, random 32+ characters | Keyed hashes for abuse-limit subjects; keep stable while counters are active |
| `TWILIO_ACCOUNT_SID` | Server configuration/secret | SMS provider account |
| `TWILIO_VERIFY_SERVICE_SID` | Server configuration/secret | Verification service |
| `TWILIO_AUTH_TOKEN` | Worker secret | Provider credential, never shipped in the APK |
| `ACCOUNT_BUCKET` | Private R2 binding | Photos for personal accounts |

The provider is an adapter, not a commitment to purchase Twilio. Another chosen provider can implement the same start/check contract. Missing configuration fails closed with a service-unavailable message; entering a guessed or fixed code does not create an account. Tests replace only the outbound provider transport in their own process. Live SMS, billing, geographic delivery settings and provider notice still need to be configured and tested. No live SMS was sent by these tests.

Initial operational limits are deliberately bounded: India mobile numbers, five sends per phone per hour, fifteen per IP per hour, one hundred globally per day, five checks per challenge and a ten-minute challenge lifetime. The per-minute resend bucket can straddle a minute boundary; the client also observes a 60-second resend countdown. Sessions expire after 24 hours and can be revoked; refresh tokens and staff identity are not implemented in this milestone. Cleanup/retention jobs and operational limit tuning are required before live rollout.

## API contract

All paths below begin with `/api/v1`. Authentication uses `Authorization: Bearer <server-issued token>`; OTP initiation/verification and capabilities are the only unauthenticated endpoints.

| Method/path | Result |
|---|---|
| `GET /capabilities` | Account-mode availability and API schema version |
| `POST /auth/challenges` | Send code for mobile, requested commercial role and preferred language |
| `POST /auth/verify` | Verify challenge/code; existing registered role wins over current selector |
| `POST /auth/logout` | Revoke the presented session |
| `GET /me`, `PUT /me` | Own profile/facility projection; name, area and language updates with expected version |
| `GET /catalogue` | Existing versioned 20/106 catalogue |
| `PUT /files/{uuid}`, `GET /files/{uuid}` | Immutable private photo upload/read for authenticated owner |
| `GET /lots?after={uuid}` | Own paginated draft list, at most 50 records |
| `GET /lots/{uuid}`, `PUT /lots/{uuid}` | Read/save own draft with command ID, expected version and uploaded photo references |

New lots currently remain drafts. No route publishes demand, marks delivery complete, uploads invoices, records money or confirms settlement yet. Later modules must follow the agreed invoice/payment separation rather than reusing the old demo completion action.

## Validation and release conditions

Backend tests cover account isolation, role retention, failed/expired/replayed codes, concurrent verification, revoked/expired/suspended accounts, photo ownership/immutability/limits, exact quantities, retry receipts, concurrent draft updates, bounded list queries and separation from the old shared-workspace API.

Verified on 24 September 2026 at commit `9c3a593d10012e8e8a76985b04fff3d7ff3fc103`: [successful GitHub Actions run](https://github.com/orcazen9-png/application-ewaste/actions/runs/35923354923).

- All 52 backend tests passed, along with the project checks and Worker build.
- Android compilation passed; all four Android 16 instrumentation tests passed, with zero failures, errors or skipped tests. They exercise native sign-in/draft/photo screens, account isolation, encrypted sessions, interrupted sync and activity/store reopening.
- The native Create a lot screenshot was retrieved and visually inspected. The saved title, collection area, category/unit controls and camera/gallery actions render correctly within the scrollable screen. This is functional foundation UI, not completed production design or localization.
- Device tests use an injected API and generated sample photo; backend tests exercise the server independently. Real SMS, deployed staging integration, physical camera behavior and a signed phone upgrade remain release checks. Activity recreation/store reopening does not replace a full physical-device process-death test matrix.

CI uploads test reports and the screenshot, not an installable replacement APK. The verification artifact expires after seven days; the retrieved local copy is under `work/account-foundation-verified/results/`. Earlier screenshot collection failures were corrected in the test harness and are superseded by the successful run above.

Before any live release: configure/test real OTP and R2, complete staff authentication and intended user workflows, define retention/deletion and provider-data terms, rehearse ownership-aware migration, check physical devices, test backup restoration, and build with the existing permanent signing key. The current development work does not deploy or migrate the live Cloudflare environment.
