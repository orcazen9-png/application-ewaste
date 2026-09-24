# Current release objective

24 September 2026. User requested the remaining invoice/settlement, analytics/earnings, notifications/languages, live configuration/deployment/physical phone testing, a published native APK, and an ERP monitoring collector–recycler activity. Branch: `codex/erp-release`. These are requirements, not completion claims. User approved individual invitations and private D1 for the demo.

| Deliverable | Evidence required | Current status |
|---|---|---|
| Invoice upload and review | Private documents, immutable revisions, issuer attribution, both-party material approval, stale/concurrent tests, native and staff flows | Implemented and tested; physical picker check remains |
| External settlements | Finance-only recording, proof/reference, partials, collector confirmations/disputes, corrections, balanced separate ledgers | Implemented and tested, including explained payment during dispute without closing custody issues |
| ERP | Shared records, India-date and area filters, drilldown, supply/demand, separate units, amounts/dues, trends, escaped CSV; browser QA | Deployed. Desktop/narrow layout checked. Facility evidence/review is not a completed production onboarding service; queues can be expanded |
| Native earnings and receipts | Derived confirmed/pending/outstanding totals and sharable receipts | Implemented; physical sharing check remains |
| Notifications | Durable role-isolated inbox, seen state, order links, Android notifications with permission handling | Implemented; periodic job, no instant push. API supports pagination; native shows latest 100 |
| English/Hindi/Marathi | User-selectable translated screens, locale dates and currency, language verification | 547 fixed phrases; emulator core flow passed. Category names, composite fragments and some technical errors still English; full localization/native-speaker review remains |
| Live authentication | Real sign-in proof and staff access | Individual one-use invitations and revocable sessions deployed; live personal/staff sign-in and logout passed. SMS not configured. Personal sessions 30 days, staff 8h |
| Live private storage | Separate resources, private uploads/read permissions, migrations and backup check | Private D1 deployed; cross-account denial passed. 200 MB raw-file demo allowance. Export restored in isolated SQLite with integrity/foreign-key/private-file SHA checks; scheduled disaster recovery not claimed |
| Deployment | HTTPS API and ERP, live smoke tests, preservation of old workspace | Separate ewaste-accounts-demo Worker/DB, migrations 0000–0008. Live Gemini laptop classification and cached retry passed. Legacy host preserved |
| Signed APK publication | Account mode enabled, correct API origin, permanent certificate, version upgrade and direct download | Published native-v4-demo from commit 98988187d3cdd6ad1297e5d46383efe54e694491. Run 35937082749 passed actual v3 → v4 installation/data-preservation and 11 native tests. Anonymous APK download/hash/certificate checks passed |
| Physical phone | Actual install/update, sign-in, capture, upload and shared order check | No connected-phone evidence. User installation/check still required; goal not complete |

Confirmed rules: collector receives material amount in full; recycler pays logistics separately; no automatic payment transfer; Freedom Value finance records external settlement; collector confirms receipt; invoice versions and proposals never silently overwrite acknowledged facts. Native Android remains Java/AppCompat, with collector and recycler roles in one APK and a separate restricted ERP.

85 backend tests and JavaScript checks pass. Android release run 35937082749 and independent verification run 35937082699 passed. Release ran 11 account/marketplace/logistics/finance tests plus the two phases of the real v3 upgrade check. Draft, photo and encrypted pairing data survived installation replacement. Downloaded APK: 2,851,661 bytes; SHA-256 bf0c385589f78be165d3e41fdfb3d45f3262309d7665a865724a1bf8dec92698.

Direct APK: https://github.com/orcazen9-png/application-ewaste/releases/download/native-v4-demo/E-Waste-Marketplace-native-v4.apk

ERP: https://ewaste-accounts-demo.ewaste-marketplace.workers.dev/operations.html

Final post-migration backup rehearsal restored 50 tables and verified both private files. Live test accounts were suspended afterward; judge invitations remain unused. User has been asked to test the actual phone install/open; no response yet.

The invited demo recycler has an expiring sandbox grant; its facility remains unverified and is shown as pending. No CPCB approval is claimed. API use requires DEMO_MODE=true. Do not copy demo grants into production. Invitations and private evidence are in ignored work/, never public artifacts.

Earlier shared-workspace data is retained by package update, not automatically assigned to personal accounts; ownership review/import remains separate.

Do not count mock authentication, emulator tests, a published APK alone, or sample ERP records as proof of real-provider/physical-phone completion. Keep unresolved requirements visible across continuations. Existing unrelated untracked research/output files are outside this change.
