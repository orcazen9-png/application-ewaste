# Current release objective

24 September 2026. User requested the remaining invoice/settlement, analytics/earnings, notifications/languages, live configuration/deployment/physical phone testing, a published native APK, and an ERP monitoring collector–recycler activity. Branch: `codex/erp-release`. These are requirements, not completion claims. User approved individual invitations and private D1 for the demo.

| Deliverable | Evidence required | Current status |
|---|---|---|
| Invoice upload and review | Private documents, immutable revisions, issuer attribution, both-party material approval, stale/concurrent tests, native and staff flows | Implemented and tested; physical picker check remains |
| External settlements | Finance-only recording, proof/reference, partials, collector confirmations/disputes, corrections, balanced separate ledgers | Implemented and tested, including explained payment during dispute without closing custody issues |
| ERP | Shared records, India-date/area/recycler/state/queue filters, drilldown, supply/demand, separate units, amounts/dues, trends, escaped CSV; browser QA | Deployed. Desktop/narrow layout and actionable queues checked. Request conversion/category-review counts are included with explicit scopes. Facility evidence/review is not a completed production onboarding service |
| Native earnings and receipts | Accepted quotes, approved invoices, pending transfers, confirmed receipts, outstanding dues and sharable receipts | Implemented; pending transfers are not confirmed earnings. Physical sharing check remains |
| Notifications | Durable role-isolated inbox, seen state, order links, Android notifications with permission handling | Implemented with older/latest navigation and stable pagination. Periodic job, no instant push |
| English/Hindi/Marathi | User-selectable translated screens, locale dates and currency, language verification | 1,075 phrase entries including all 20 broad/106 detailed category labels. Category-selection code preservation and navigation tested. New live Gemini explanation returned Hindi. User notes/historical evidence retain their language; native-speaker review remains |
| Live authentication | Real sign-in proof and staff access | Individual one-use invitations and revocable sessions deployed; live personal/staff sign-in and logout passed. SMS not configured. Personal sessions 30 days, staff 8h |
| Live private storage | Separate resources, private uploads/read permissions, migrations and backup check | Private D1 deployed; cross-account denial passed. 200 MB raw-file demo allowance. Export restored in isolated SQLite with integrity/foreign-key/private-file SHA checks; scheduled disaster recovery not claimed |
| Deployment | HTTPS API and ERP, live smoke tests, preservation of old workspace | Separate ewaste-accounts-demo Worker/DB, migrations 0000–0008. Live Hindi Gemini laptop classification/cached retry, private D1 roundtrip, ERP filters/export, earnings fields and logout passed. Legacy host preserved |
| Signed APK publication | Account mode enabled, correct API origin, permanent certificate, version upgrade and direct download | Published native-v6-demo from d0587fa66b7034d7f2d24b7c40fed8c97e0e3bb4. Run 35948754613 passed actual v5 → v6 installation/data preservation, 15 native tests and the compact UI check. Public download/hash and certificate verification passed |
| Physical phone | Actual install/update, sign-in, capture, upload and shared order check | User screenshots establish v5 installation, collector sign-in and access to lot creation/earnings. User rejected the UI. Camera, document picker and complete shared-order verification remain unproven |

Confirmed rules: collector receives material amount in full; recycler pays logistics separately; no automatic payment transfer; Freedom Value finance records external settlement; collector confirms receipt; invoice versions and proposals never silently overwrite acknowledged facts. Native Android remains Java/AppCompat, with collector and recycler roles in one APK and a separate restricted ERP.

88 backend tests and JavaScript checks pass. Release run 35948754613 and independent verification run 35948754763 passed. The release ran 15 native tests, the two phases of the actual v5 → v6 upgrade check and a compact UI check at 360 × 640 dp with 130% system text. Draft, photo, encrypted pairing, personal session and account cache survived replacement. APK: 2,887,301 bytes; SHA-256 a4eb5b0dfd962d8b9480c6267b2329a1d19d2d8c440d2254c583848f1d862626. Permanent certificate SHA-256: 5e58825c808bff6d805254857108cbd09111a12ee15253888b3b3cc06c60f5d8.

Direct APK: https://github.com/orcazen9-png/application-ewaste/releases/download/native-v6-demo/E-Waste-Marketplace-native-v6.apk

ERP: https://ewaste-accounts-demo.ewaste-marketplace.workers.dev/operations.html

Post-migration backup rehearsal restored 50 tables and verified both private files present at export. V5 live checks additionally verified Hindi Gemini output, private D1 upload/read, earnings fields, staff queue/state analytics and filtered export. Live test accounts were suspended afterward; judge invitations remain unused. Latest Cloudflare version: 2f6c4b78-7931-4a9b-8aba-0774ccd0fdfd. User phone screenshots confirm v5 install/sign-in and prompted the UI correction below; a full physical transaction check is still outstanding.

The invited demo recycler has an expiring sandbox grant; its facility remains unverified and is shown as pending. No CPCB approval is claimed. API use requires DEMO_MODE=true. Do not copy demo grants into production. Invitations and private evidence are in ignored work/, never public artifacts.

Earlier shared-workspace data is retained by package update, not automatically assigned to personal accounts; ownership review/import remains separate.

Do not count mock authentication, emulator tests, a published APK alone, or sample ERP records as proof of real-provider/physical-phone completion. Keep unresolved requirements visible across continuations. Existing unrelated untracked research/output files are outside this change.

## UI correction after phone review

The user's 24 September phone screenshots exposed an unacceptable form-first interface. V6 replaces the account presentation with persistent navigation, grouped fields, clear primary actions, a photo/details/review lot flow and an earnings dashboard. Draft IDs, account sessions, payment rules and the Cloudflare API remain in place. Actual Android renders from run 35948017131 were visually reviewed; its 14 normal-size native tests passed. The first compact-font command failed because Gradle had removed the test APK; both APKs are now explicitly reinstalled before that check. V6 then passed its signed release run and compact check. Home, photo entry, details, review and earnings were visually inspected in actual Android renders. A thumbnail sizing issue found during review was corrected before publication. The compact layout keeps camera/upload and the next action fully visible. These screenshots use isolated fixtures, not live financial records. The user still needs to assess the replacement UI on the physical phone.
