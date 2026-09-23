# Native marketplace: requirements to accepted orders

Development milestone, 24 September 2026, branch `codex/marketplace-orders`. Builds on the [account foundation](account-foundation.md) and implements the core demand-to-order path in M3 of the [production plan](production-requirements-plan.md). It has not deployed, migrated, or replaced the live phone application.

The subsequent `codex/logistics-receipt` milestone adds pickup, inspection, custody guards and the operations portal. Its [implementation guide](logistics-receipt.md) supersedes the logistics limitations below on that branch; invoice and payment work remains separate.

## Working paths

**Recycler:** Home → Buying portfolio → Add/edit requirement. Specify a broad category, optional detailed equipment code, specification, price per kg or piece, minimum quantity, finite or unlimited demand, service areas, pickup/drop-off and expiry. Paused requirements stay private. Publishing requires a verified facility; this milestone does not offer self-verification or a new verification administration interface.

**Collector:** Home → Create/open lot → camera/gallery or manual entry → optional Gemini suggestion → confirm category and quantity → Save online → Find recycler requirements for this line → choose quantity → review a matching requirement → share photos and submit. Lots can have multiple material lines, each with its own unit and quantity. Each request currently selects one line and one requirement; multiple lines are submitted separately, not combined into a mixed-unit order.

**Both parties:** Requests → shared details/photos → clarification. Collector can withdraw; addressed recycler can reject or accept. A requirement specifying a detailed code needs the recycler's latest explicit category confirmation before acceptance. Original photo/category evidence remains alongside the confirmations.

**After acceptance:** Orders → shared material amount, request reference, price revision history and recent activity. Either party can propose a revised material amount with a reason; the other party acknowledges it. The current acknowledged amount changes only on acknowledgment. Either party can cancel before collection in this milestone and release the reservations. Pickup, custody, invoices and settlement are not implemented by this module; when M4 introduces custody transitions, cancellation must respect those new stages.

## Commercial and integrity rules

- Acceptance creates one order per request and reserves both collector stock and recycler demand in the same transaction. Database triggers enforce current versions, availability, account/facility state, expiry and capacity. A failed guard aborts the batch, including its receipt and audit writes. Zero-row version checks cannot create successful command receipts.
- A 500 kg requirement accepting 200 kg shows 300 kg remaining. Cancelling the uncollected order restores 500 kg. Two acceptances competing for the same supply or remaining demand cannot both succeed when capacity is insufficient. Unlimited demand is stored as null, distinct from zero.
- The submitted quote, material description, collection area, reviewed category and approved photo references are snapshots. Later portfolio changes never rewrite these snapshots. A changed quote/draft requires a refreshed request before acceptance. A lot with reserved stock cannot be edited in place; cancellation releases it, or a separate lot can represent genuinely separate stock.
- Material and quantity identity cannot change on a requirement with allocations. A finite demand target cannot be lowered below allocated quantity. Rates can change for future requests. Existing orders retain their own acknowledged price history.
- INR 10,000 material stays INR 10,000 payable to the collector. Logistics remains an additional recycler liability, currently shown as not arranged. Acceptance, price acknowledgment and cancellation do not record a payment. Final invoicing and Freedom Value settlement recording remain later work.
- Quantities use integer grams or whole pieces. Prices use integer paise; multiplication uses BigInt before rounding once to paise, avoiding unsafe intermediate floating-point products. Rates in different units are not ranked against one another.
- Matching uses the existing 20 broad groups, compatible unit, available quantity and normalized exact service-area names. It is not geospatial routing. Active, unexpired requirements from verified facilities are discoverable; incompatible entries explain unit/area/minimum/capacity exclusions. Paused/unverified/expired portfolio entries are hidden, and a previously displayed entry is revalidated on submission and acceptance.
- Recycler photo access is restricted to file references explicitly shared with that request. Direct access to another account's private `/files` route remains denied. Shared evidence currently remains accessible to the parties after rejection/withdrawal/cancellation; retention, erasure and lifecycle decisions must be completed before production.

## Native persistence and identification

The existing SQLite account database upgrades additively from version 1 to 2, preserving saved lots. Marketplace forms, selections and fetched responses are cached per account. Last-checked time is visible, and server versions protect stale actions. One uncertain commercial command is retained per account with its original command ID, body, route and destination; Retry pending action replays it after timeout/restart instead of creating a new request. Definitively rejected commands are cleared so the user can review and resubmit. A signed-out account's pending action cannot run as the next user.

Photo identification is explicit and uses the existing server Gemini adapter. Collectors receive broad suggestions; recyclers assess only shared request photos against the detailed catalogue. Results require human review. Successful results are stored and reused for the same account/photo/scope; reopening a result does not trigger another paid call. Each account is limited to 12 new assessment attempts per UTC day, with 100 globally. The adapter's speculative duplicate request is disabled for these routes. A failed assessment can be explicitly retried; ambiguous or unavailable results keep the manual path. No live AI calls were made during implementation tests.

The UI handles one selected photo per assessment, and the user chooses which suggestion to apply to a material line. Approximate image counts are not used as measured quantities. The original provider result is retained separately from category corrections. New screens remain English; the stored language preference and production localization work are unchanged.

## Storage and API

`0003_marketplace_orders.sql` adds requirements/revisions, requests/shared files, orders/terms, reservations, shared events and assessment records. Existing records are preserved. Handwritten trigger guards are part of this migration and must be retained in future schema changes; Drizzle snapshots alone do not represent trigger behavior. The migration journal stays strictly increasing for timestamp-based migration clients.

All paths use the existing authenticated `/api/v1` prefix. Account mode and the native `accountFoundation` build flag still control activation.

| Endpoint | Purpose |
|---|---|
| `GET /requirements`, `GET/PUT /requirements/{id}` | Owner-only recycler portfolio and versioned edits |
| `GET /matches?lotId=…&itemId=…&quantity=…` | Collector's selected line compared with discoverable demand |
| `GET /requests`, `GET/POST /requests/{id}` | Party-scoped request list/details and collector submission |
| `POST /requests/{id}/clarify`, `/review-category`, `/reject`, `/withdraw`, `/accept` | Explicit, role-checked request transitions |
| `GET /requests/{id}/photos/{fileId}` | Only the photos shared with this request |
| `GET /orders`, `GET /orders/{id}` | Shared accepted order and original request, terms, recent activity |
| `POST /orders/{id}/propose-terms`, `/acknowledge-terms`, `/cancel` | Versioned price proposals and cancellation before collection |
| `GET/POST /assessments/{id}` | Owned/scoped Gemini assessment and saved-result retrieval |

Commercial writes carry a persistent command ID and expected version where applicable. Lists use UUID cursors and pages of 50; recent event/term panels show at most 100 events/50 terms. Complete-history export, notification delivery and staff views remain subsequent work. Discovery is by stable ID, not a claim of best-price ranking.

## Verification and rollout boundary

Backend integration tests exercise real local SQLite migrations/triggers through the Worker routes, including competing supply/demand acceptance, retry replay, owner isolation, shared photo permissions, stale quotes/drafts, detailed-category review, cancellation release and acknowledged price revisions. Gemini transport is replaced only inside tests. The Android test suite exercises actual native screens against a controlled in-process API, including collector comparison/submission, recycler portfolio editing/acceptance and persistent pending commands; deployed phone-to-Cloudflare testing is still required.

Verified on 24 September 2026 at code commit `e9beec5ec16f957c58857613737c6d5bd2dfa899`:

- [GitHub Actions run 35927433355](https://github.com/orcazen9-png/application-ewaste/actions/runs/35927433355) passed both jobs: 64 backend tests, type checking and production build, plus native compilation and all 7 Android 16 instrumentation tests with no failures or skips.
- Wrangler 4.137.0 applied migrations `0000` through `0003`, including the reservation triggers, successfully against a fresh local D1 database. The live database was not accessed or migrated.
- The native shared-order and account-draft screenshots were downloaded and visually checked. Local copies: [shared order](../work/marketplace-verified/results/native-market-order.png) and [account draft](../work/marketplace-verified/results/native-account-draft.png). These ignored local files are not committed; the CI run's `account-foundation-test-results` artifact contains the screenshots and reports and expires on 30 September 2026.

These checks verify native flows and backend integrity independently. They do not replace staging tests with a real SMS provider, live Gemini responses, private cloud storage or a physical phone.

Before staging activation: finish M2's configured OTP, separate D1/private R2 resources and staff verification process; apply all additive migrations; configure the existing server-only Gemini model/key; use real authorized facility verification records. Before production: complete retention/deletion, translated/accessibility checks, operational limits, physical-device testing, backup/migration rehearsal and the remaining product workflows. This commit does not send SMS, buy services, create cloud resources, or distribute an installable replacement APK.

Next implementation: Freedom Value operations authentication and logistics coordination, scheduling, handover/receipt evidence and quantity variances (M4), followed by invoices and externally recorded settlement with collector confirmation (M5).
