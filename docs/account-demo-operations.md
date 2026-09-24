# Accounts demo operator guide

The APK uses the separate `ewaste-accounts-demo` Cloudflare Worker and database. The earlier `ewaste-demo` workspace remains separate. Personal account data is never inferred from a shared pairing code.

ERP: https://ewaste-accounts-demo.ewaste-marketplace.workers.dev/operations.html

## Invitations

Run commands from the repository using an authorized Cloudflare CLI session. The CLI writes private files under ignored `work/invitations/`. It sends only token hashes to D1. Do not publish invitation files or include them in release artifacts.

```powershell
node scripts/account-invite.mjs role=collector 'name=Collector name' locality=Mumbai
node scripts/account-invite.mjs role=recycler 'name=Recycler name' locality=Mumbai
node scripts/account-invite.mjs role=operations_finance 'name=Freedom Value operator'
```

Roles are server-issued. `viewer` can inspect ERP, `operations` manages logistics, `finance` records settlements, and `operations_finance` combines the latter two. Issuing a recycler invitation does not verify its facility or automatically grant demo trading access.

An invitation is usable once and expires after seven days. A personal session lasts 30 days; a staff session lasts eight hours. Logging out revokes that session. For another sign-in, reissue for the existing actor printed by the original command:

```powershell
node scripts/account-invite.mjs role=collector 'name=Collector name' actor=user:EXISTING-UUID
node scripts/account-invite.mjs role=operations_finance 'name=Freedom Value operator' actor=staff:EXISTING-UUID
```

Replace the actor value with the exact existing actor. Reissue validates the current role, revokes earlier invitations and sessions for that identity, and preserves business records. Do not issue a new identity to recover an existing account. Each person should have their own invitation; do not share staff credentials with judges using collector/recycler roles.

## Demo boundaries

- Photos and invoices are private D1 chunks, checked against stored hashes. The allowance is 200 MB of raw files. Account photos are limited to 2 MB and documents to 5 MB. Private file permissions remain attached to accounts and shared orders.
- The invited demonstration recycler has a specific expiring `demo_facility_access` record. Its facility remains unverified. The API accepts this grant only when `DEMO_MODE=true`, and the interface identifies it as demo access. No CPCB verification is claimed.
- Finance records external transfers; the app sends no money. Collector material receipts and recycler-paid logistics are separate. Pending transfers do not reduce the confirmed outstanding amount. Invoice approval and physical custody remain separate.
- Android checks its notification inbox periodically when the OS permits. This is not an instant push service. Older notifications remain available through inbox pagination.
- Controls, all 20 broad/106 detailed categories, statuses and known validation messages support Hindi and Marathi. People’s notes and historical AI evidence retain their original language; technical diagnostics can show the original error. New Gemini requests ask for explanations in the selected language. Native-speaker review remains outstanding.
- Earnings separate accepted quote value, approved invoices, pending transfers, confirmed receipts and outstanding dues. A pending transfer is not earned money; quotes can change through the order workflow.
- ERP supports India-date, area, recycler, order-state and attention-queue filters. Invoice review, receipt confirmation, disputes and unscheduled logistics link to matching orders; CSV exports use the same filters. Request conversion and category-review counts have separate scopes explained on screen. Category-review counts are not AI accuracy measurements.

## Release and recovery evidence

`accounts-release.yml` gates v6 publication on backend checks, the permanent signing certificate, actual previous-v5 installation and v6 replacement with local-data/keystore preservation, and Android 16 native tests. The upgrade check includes draft/photo data, encrypted pairing, the personal session and an account cache record. Invitation codes, Cloudflare credentials, signing keys and Gemini keys must never appear in public artifacts.

A remote SQL export has been restored in isolated SQLite with integrity/foreign-key checks and reconstruction/hash verification of private files. Exports contain private records and credential hashes; keep them under private access controls. That rehearsal does not establish a scheduled backup policy or authorize replacing the live database.

Before declaring the demo verified on a phone: install/update without uninstalling, redeem the collector invitation, create a lot, capture/upload a photo, identify and confirm its category, save it online, create an appropriate recycler requirement on a second device, submit/accept a request, and verify that same order in ERP. Invoice/receipt and notification permission flows also require a physical-device check. Record failures with the precise screen/message and preserve local drafts.
