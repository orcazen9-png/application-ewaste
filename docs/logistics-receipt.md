# Logistics and native custody evidence

Development milestone, 24 September 2026, branch `codex/logistics-receipt`. Builds on [marketplace orders](marketplace-orders.md). Implements the core M4 operations, pickup, inspection and return paths. No live Cloudflare settings, staff invitations, physical pickups or phone installations have been changed.

## What works

- The restricted Freedom Value portal is `/operations.html`. Staff can browse orders, filter the current page by area/recycler/status, maintain partner availability/service areas, schedule or reschedule, record estimated/final logistics charges, record transit updates, arrange returns, manage issues and keep restricted notes. Viewer accounts can read but cannot mutate.
- Native Android: shared order → **Pickup & receipt**. Collector can request a schedule change, record handover with photos and actual quantity, review/dispute receipt and confirm returned goods. Recycler acknowledges the separate logistics charge and records or corrects inspection evidence. Both parties see the same permitted history.
- Evidence forms preserve local drafts, photo references and pending commands by account. Camera/gallery images are re-encoded without EXIF before private upload. Photos upload before the immutable command is sent. Restarting after a lost response reuses the command ID and photo IDs. Changed order versions require review; saved form contents are retained.
- A handover requires a scheduled active partner, the recycler's current charge acknowledgment and no unresolved pickup issue. Availability is rechecked in the database transaction. Opening a schedule-change request creates an issue for operations; it does not silently move the agreed window.
- Every successful order action records actor, server time and monotonically increasing order version. Earlier schedules, charge revisions and inspection evidence remain available. Receipt corrections explicitly reference the earlier receipt. Partner revisions retain actor, time, version and snapshot in command receipts.

## Money and physical custody

Material INR 10,000 plus logistics INR 1,000 still means INR 10,000 material payable to the collector and a separate INR 1,000 recycler liability. Neither handover, inspection, quantity acceptance nor return marks anything paid. Cost revisions invalidate the earlier cost acknowledgment. Material price revisions remain separate and available through the existing shared order.

An accepted 200 kg order reserves 200 kg of supply and demand. A handover of 150 kg releases the 50 kg still with the collector; demand remains reserved until receipt review. If 200 kg leaves the collector and the recycler records 180 kg, collector acknowledgment consumes 180 kg demand and releases 20 kg demand, while the full 200 kg remains unavailable in collector stock. Only collector confirmation of the actual 20 kg return releases that supply. Missing goods remain an open custody exception.

Received quantities above recorded handover are retained as disputed evidence but cannot be acknowledged. A corrected inspection or separately reviewed additional-stock order is required; the API does not invent extra supply or demand. Quantities retain the order's kg/piece unit. Zero receipt is supported. Return quantities cannot exceed goods still eligible for return.

Cancellation before handover releases reservations. A database guard rejects cancellation after handover, including a concurrent cancellation/pickup race. Operations must arrange a return and the collector must confirm physical receipt. A full confirmed return releases remaining allocations and displays `returned`; it does not manufacture a refund or settlement. Pre-pickup issues can still be resolved on a cancelled order without reopening it.

## Staff identity and permissions

Operations uses a Cloudflare Access application assertion, independently verified in the Worker with RS256, a pinned team issuer, configured application audience, expiry/not-before checks and a public signing key fetched from that team. Email headers and mobile account bearer tokens cannot grant staff access. The signed subject **and** email must match an active administrator-provisioned `operations_staff` entry. No public endpoint can invite staff, change staff roles or self-promote.

Reference: [Cloudflare's JWT validation guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). Configure an actual organizational identity provider and Access policy before staging. The code does not create an Access application or choose a paid plan.

Server configuration required:

| Setting | Value |
|---|---|
| `ACCOUNTS_ENABLED` | `true` on the separate account staging environment |
| `OPS_ENABLED` | `true` only after staff identity and policy setup |
| `OPS_ACCESS_ISSUER` | Exact `https://<team>.cloudflareaccess.com`, no trailing slash |
| `OPS_ACCESS_AUD` | Audience tag of the operations Access application |
| `ACCOUNT_BUCKET`, `DB` | Existing private account bucket and migrated staging D1 bindings |

Protect the operations hostname/path and `/api/ops/*` through the same Access application. The Worker also verifies assertions on any alternate hostname. Browser mutations require an exact same-origin `Origin`; the portal sends JSON and is protected by a restrictive content security policy. Staff suspension takes effect on the next request. Signing keys and user assertions are never stored in the APK or portal JavaScript.

An authorized deployment administrator must create each staff record using the verified Access subject, exact email, display name, UUID and role (`operations` or `viewer`); record the approval in the deployment access log. Staff invitation/revocation administration screens and automatic identity provisioning are not implemented. Do not insert demo subjects into a real environment. `ACCESS_CERT_TRANSPORT` is an in-process test transport used with locally generated signing keys; HTTP clients cannot set it.

## Data and API

`0004_logistics_receipt.sql` adds seven tables: `operations_staff`, `logistics_partners`, `logistics_jobs`, `logistics_records`, `logistics_files`, `logistics_cases`, `logistics_commands`. It adds nullable `reservations.demand_base`, keeping existing rows equivalent through `coalesce(demand_base,quantity_base)`. Old supply/demand guard triggers are replaced to account for independently reviewed demand. Migration timestamps are strictly increasing; handwritten triggers must be retained by future migrations.

| Route | Permission / purpose |
|---|---|
| `GET /api/ops/me` | Verified active staff identity |
| `GET /api/ops/orders`, `/orders/{id}` | Staff order board and operational detail |
| `GET /api/ops/partners`, `PUT /partners/{id}` | View partners; operations-only versioned changes |
| `POST /api/ops/orders/{id}/{action}` | `schedule`, `cost`, `in-transit`, `return-request`, `issue`, `resolve-issue`, `internal-note` |
| `GET /api/v1/orders/{id}/logistics` | Collector/recycler order-scoped projection |
| `POST /api/v1/orders/{id}/logistics/{action}` | Role-checked `acknowledge-cost`, `schedule-change`, `pickup`, `receipt`, `accept-receipt`, `confirm-return`, `issue` |
| `GET /api/v1/orders/{id}/logistics/photos/{fileId}` | Evidence explicitly linked to this order, parties only |
| `GET /api/ops/orders/{id}/photos/{fileId}` | Same linked evidence, staff identity required |

Evidence accepts at most five ready, owned photos, actual quantity, condition, note, capture time within the past 30 days, and explicitly manual location. Missing photos require a recorded explanation. Recycler accounts may now upload private photos through the same bounded file service, but cannot access other users' files. Attaching a private photo to handover evidence explicitly shares it with that order and authorized operations.

Commercial order version checks serialize logistics, price and cancellation writes. Changes, evidence links, allocation adjustments, issue transitions and command receipts commit together in a D1 batch. Zero-row compare-and-swap writes cannot produce a successful receipt. The staff portal persists uncertain commands in account-scoped session storage; native commands persist in account-scoped SQLite. Portal session storage does not survive closing the browser session, so staff must review the order before re-entering an uncertain action after that boundary.

## Verification and remaining work

Backend tests cover staff signature/audience/expiry/suspension/role/CSRF checks; private evidence and staff notes; price separation; short and excess receipt; immutable correction history; return recovery; partner unavailability; cancellation/pickup races; demand reuse; and idempotent retries. Native tests cover photo processing, draft recovery, lost-response replay, separate charge acknowledgment and receipt entry on Android 16. Final CI results will be recorded here after completion.

All five migrations were successfully applied to a fresh **local** Cloudflare D1 runtime. Browser verification used a loopback-only isolated SQLite/R2 fixture with locally signed test identities: opened the order, recorded an issue and resolved it, retaining the timeline.

This is not the entire M4/production exit gate. Still required before real pickups: staging identity/private storage activation, actual staff/partner/service-area setup, operational escalation ownership and physical-device testing. Complex post-acknowledgment returns/reversals, write-offs for lost/damaged goods, pickup-evidence amendments, multiple shipments/partners, complete paginated audit exports, staff provisioning UI, retention/deletion, localization and notification delivery remain subsequent work. Unsupported custody adjustments remain blocked with an open case; staff cannot silently restore stock or close unresolved missing-goods cases.

Next planned implementation is M5: invoice upload and exact-version review, separate material/logistics liabilities, Freedom Value recording external settlement, partial payments and collector receipt confirmation. Delivery remains separate from settlement throughout.
