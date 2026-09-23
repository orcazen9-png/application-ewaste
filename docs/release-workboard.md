# Current release objective

24 September 2026. User requested the remaining invoice/settlement, analytics/earnings, notifications/languages, live configuration/deployment/physical phone testing, a published native APK, and an ERP monitoring collector–recycler activity. Branch: `codex/erp-release`. These are requirements, not completion claims.

| Deliverable | Evidence required | Current status |
|---|---|---|
| Invoice upload and review | Private documents, immutable revisions, issuer attribution, both-party material approval, stale/concurrent tests, native and staff flows | Implementing |
| External settlements | Finance-only recording, proof/reference, partials, collector confirmations/disputes, corrections, balanced separate ledgers | Implementing |
| ERP | Real shared records, filters, actionable queues, drilldown, supply/demand, quantity units, amounts/dues, trends and exports; browser QA | Existing logistics portal; analytics extension planned |
| Native earnings and receipts | Derived confirmed/pending/outstanding totals and sharable receipts | Planned |
| Notifications | Durable role-isolated inbox, seen state, order links, Android notifications with permission handling | Planned |
| English/Hindi/Marathi | User-selectable translated screens, text scaling, locale dates/currency, language verification | Planned |
| Live authentication | Configured real provider or user-approved alternative; real sign-in proof and staff access | Gemini is the only live Worker secret; SMS provider question pending |
| Live private storage | Separate account resources, private uploads/read permissions, migrations and backup check | R2 API reports account R2 not enabled (10042) |
| Deployment | HTTPS API and ERP, live smoke tests, preservation of old workspace | Cloudflare CLI authenticated; no account environment deployed yet |
| Signed APK publication | Account mode enabled, correct API origin, permanent certificate, version upgrade and direct download | Permanent signing workflow exists; new release planned |
| Physical phone | Actual install/update, sign-in, capture, upload and shared order check | Asked user about USB/manual installation; no local adb/Java found |

Confirmed rules: collector receives material amount in full; recycler pays logistics separately; no automatic payment transfer; Freedom Value finance records external settlement; collector confirms receipt; invoice versions and proposals never silently overwrite acknowledged facts. Native Android remains Java/AppCompat, with collector and recycler roles in one APK and a separate restricted ERP.

Do not count mock authentication, emulator tests, a published APK alone, or sample ERP records as proof of real-provider/physical-phone completion. Keep unresolved requirements visible across continuations. Existing unrelated untracked research/output files are outside this change.
