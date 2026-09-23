# Recovered original E-Waste Marketplace versus native v3

Reviewed 24 September 2026. This is a read-only comparison of application behavior implemented in source and packaged artifacts, not a new physical-phone test. Application code and deployment were not changed during this comparison.

## Exact builds and limits

| | Recovered original | Current native v3 |
|---|---|---|
| Git commit | `07adaa6057a43edc99463a45d39c2b1663f0b29c` | `c4080d8d603ee3c7dfa0dd1e4707cb09f5368df7` |
| Version | 0.2.0 / version code 2 | 2.1-native / version code 3 |
| GitHub build | [September 11 original](https://github.com/orcazen9-png/application-ewaste/actions/runs/34649589090) | [Native v3](https://github.com/orcazen9-png/application-ewaste/actions/runs/35908615465) |
| APK bytes | 4,168,469 (4.17 decimal MB) | 2,771,628 (2.77 decimal MB) |
| Package | `com.ewaste.marketplace` | `com.ewaste.marketplace.collector` |
| UI implementation | Packaged web application in Capacitor | Java/AppCompat Android Views |
| Packaged web assets | 16 files | None under `assets/public/` |
| SHA-256 | `997cabc31c32c6d802c0891766911881b8f643148d4d849f6259e2d9eee9a9c7` | `0423c1837f96b508b2720f72e27670db89ca913ff49d11eda3f8b3306ca52ed7` |

The original APK was downloaded from GitHub artifact 10282834894 and its ZIP checksum verified. Its packaged `app.js`, `workflows.js`, `sync.js` and `i18n.js` exactly match the source at the original commit. Earlier September 11 artifact ZIPs were also about 3.79 MB. No 50 MB E-Waste Marketplace APK was identified in the inspected GitHub builds. This report does not establish which file or installed-storage figure the remembered 50 MB refers to. The separate Kabadi Setu project is excluded because the user previously said it was not their original app.

Both versions are prototypes. Simulated buyers, prices, statuses and payment records must not be described as live commercial integrations.

## Feature differences

| Area | Recovered original | Native v3 | Result |
|---|---|---|---|
| Home and navigation | Home, Prices, My Lots, Earnings; prices and recent lots on Home | Home, Orders, central Scan, Contacted, Profile; demand feed | Redesigned; old price/lot/earnings destinations moved under Profile/Orders |
| Languages | English, Hindi and Marathi selector and translated core flows | English only; backend profile forces `language: en` | Missing in v3 |
| Spoken prices | Speech action using a supported device/browser voice, with unavailable fallback | No text-to-speech action | Missing in v3; original phone support was not guaranteed |
| Price discovery | Rates and ranges by Mumbai/Thane/Navi Mumbai, movement, history charts, automatic simulated refresh | Basic three-material price ranges; legacy price screen fixed to Mumbai; manual shared-state refresh | Reduced |
| Saved estimate evidence | Original/listed estimate, date and current estimate shown separately | Estimate while editing; original-versus-current comparison absent from detail screen | Reduced presentation; stored backend records are not asserted deleted |
| Lot creation | Photo, pricing material, approximate kg, locality, condition, notes and local drafts | Native camera/gallery, same core fields and local drafts | Retained and extended |
| AI identification | No integrated Gemini in this September 11 build | Cloudflare Gemini request, description, evidence/uncertainty, 20 broad categories and human confirmation/correction | Added; internet and workspace connection required |
| Category/pricing coverage | Three pricing materials: cables, PCBs and motors | 20 broad recognition categories, but general lot publication still requires one of those three pricing materials; seven separate sample requirements support kg/pieces | Broader recognition does not mean complete valuation/listing coverage |
| Demand marketplace | Eligible buyers and competing offers linked to a listed lot | Seven sample demand cards, service-area/category filters, comparable-price sorting, expiry and details | New demand workflow |
| Existing lot offers | All eligible sample buyers can be requested; agreed quote and downstream flow displayed | Basic request/accept controls; hard-coded selection of one buyer to request per locality/material branch | Reduced original offer discovery and follow-through |
| Pickup scheduling | Date/time, instructions, rescheduling and previous-slot history | Generic simulated Pickup stage and pickup/drop-off label | Scheduling and rescheduling missing |
| Handover evidence | Actual weight, separate handover photo, manually entered location, timestamp and buyer confirmation | New order accepts confirmed quantity; no separate handover evidence form | Major regression |
| Handover correction | Buyer dispute/reason and revised handover retaining earlier evidence | No corresponding dispute/correction flow | Missing |
| Payment recording | Individual partial/full simulated payments linked to confirmed handover; outstanding balance | Marking a new order Completed sets `paidPaise` equal to the full final total | Partial payments and payment evidence missing |
| Earnings | Sale value, money received, outstanding dues and linked transaction history | New order completed-payment summary; separate legacy total of confirmed payments | Reduced and split across two systems |
| Receipts | Detailed receipt with weight/rate/value, location and payment history; print action | No receipt or print/share receipt screen | Missing; old Android printing depended on WebView support |
| Record consistency | Linked lot → accepted offer → pickup → handover → payments → receipt/ledger | Original lots/offers coexist with separate `collectorMarket.orders`; no complete unified legacy/new transaction journey | Major integration gap |
| Existing lots after acceptance | UI continues through pickup, handover and payments | Legacy lot detail stops offering transaction actions once accepted; no native controls for the remaining legacy flow | Major regression |
| Lot cancellation and activity | Draft/listed cancellation, status filters, per-lot event timeline | No legacy lot cancellation action or full activity display; new marketplace orders have cancellation and timeline | Partially replaced |
| Offline drafts | Local photo/draft persistence and cached prices | Atomic local draft/photo persistence and cached shared state | Retained |
| Synchronization and retry | Persistent transaction outbox, periodic synchronization while active, recoverable stale listing edits | Persistent manual retry for listing and new marketplace actions; legacy offer/accept request ID is not persisted across retries | Reduced automation and inconsistent retry coverage |
| Buyer/recycler interface | Demo buyer view and separate expandable simulation controls | Collector screens only; simulation buttons inside new order details | Original buyer view not ported |
| Contacted recyclers | No dedicated contact-history screen | Separate history with statuses and resume action | Added, but records interactions only; no call/chat/message delivery |
| Profile | Language/locality preferences and basic collector identity | Editable name/locality and summary | Name editing added; no phone/photo/language/logout account flow |
| Notifications | Linked original lot transaction events | New order/contact inbox with read state and links | Changed; original and new notification histories are not unified; no push |
| Safety | Material-specific cable/PCB/motor warning within relevant flows | Dedicated eight-card battery-focused safety section | Dedicated destination added, but category-specific coverage, illustrations/audio and automatic hazard routing remain incomplete |
| Demo controls | Seed/reset sample transactions without deleting user lots, offline simulation, price-refresh control | No equivalent complete demo-control panel; order simulation buttons only | Reduced |
| Backend connection | Configurable workspace endpoint; hosted default had an access gate | Fixed Cloudflare Worker endpoint; server-side Gemini credentials | Hosting/integration changed as requested |
| Local data migration | Data belongs to original package/storage | Separate package and storage; shared workspace accessible using pairing code | Old device-only drafts are not imported |
| Signing and verification | Debug signing, without guaranteed stable key | Persistent signing secret, pinned certificate and Android 16 same-key update/data-preservation test | Improved for future v3-family updates; not an in-place update of original package |

## Requirements still missing, rather than features proven removed

The supplied Local Collector PRD contains requirements beyond the September 11 build. These are gaps in v3, but should not all be described as regressions from the old app:

- AUTH-01–05: protected sign-in, mobile OTP, language onboarding, individual persistent sessions and logout. A shared workspace pairing code is not an individual collector account.
- Profile: mobile number, profile image, preferred language and onboarding status; only name/locality editing is present.
- Security: collector ownership isolation and separate recycler permissions. Current demo operators sharing a code can operate the workspace.
- MKT-04: actual recycler authorization/verification data and a verification process. Current recyclers are explicitly fictional/unverified.
- Contact: real recycler communication. The contact action saves a record, not a delivered message.
- Matching: actual distance and complete ranking by material, distance/service area, comparable price, quantity fit and freshness. Current matching filters service area/category and provides simpler sorting.
- SCAN-05 and the commercial journey: consistent quantity, material and price support from identification through sale across all intended categories. Existing general listings and demand-based orders differ.
- Safety: illustrated, localized, material-specific instructions and unsafe-item alerts/routing; current content is primarily battery text.
- Notifications: matching new demand, price changes, pickup reminders and safety alerts beyond the current order/contact events.
- Product analytics: explicit login/scan/confirmation/marketplace/contact/safety funnel events and analytics views. Transaction timestamps alone do not implement that requirement.
- Camera presentation: native capture is delegated to the phone camera app; the dedicated in-app camera preview/flash/result-screen specification is not fully reproduced. A numerical confidence is not displayed; the PRD qualifies this as “where available,” so no score should be invented.
- The broader requested ecosystem—recycler/refurbisher application with 106-category review and ERP analytics—is not delivered by this collector APK. Separate web/backend experiments should not be presented as finished native applications.

Real payment integration and live GPS tracking were not implemented in the recovered original either. The Local Collector PRD explicitly permits mocked payments for the prototype; missing partial-payment accounting is still a regression from the older prototype.

## Repair priorities

1. Restore one connected transaction flow in native UI: original lot and quote, pickup scheduling/rescheduling, evidence-backed handover, correction/confirmation, partial payments, dues, receipts and earnings.
2. Restore English/Hindi/Marathi, price history/locality controls, spoken-price behavior and original estimate visibility.
3. Unify original lots and new demand orders, their notifications and payment records; extend persistent retry/recovery consistently and define migration for local-only drafts.
4. Complete the new PRD's authentication, profile, permissions, contact, safety and analytics requirements, with demo integrations explicitly labelled until real services exist.
5. Verify the full journey against the original behavior and the accepted PRD before another replacement APK is presented as equivalent.

## Evidence

- Original packaged source: `work/app-comparison/original-source/` (recovered and byte-compared with APK assets).
- [Original app UI](https://github.com/orcazen9-png/application-ewaste/blob/07adaa6057a43edc99463a45d39c2b1663f0b29c/dist/app.js): price history/speech, languages, ledger, estimates, buyer view and periodic sync.
- [Original transaction UI](https://github.com/orcazen9-png/application-ewaste/blob/07adaa6057a43edc99463a45d39c2b1663f0b29c/dist/workflows.js): offers, scheduling, evidence, disputes, payments and receipts.
- [Original sync](https://github.com/orcazen9-png/application-ewaste/blob/07adaa6057a43edc99463a45d39c2b1663f0b29c/dist/sync.js): persistent outbox and stale-edit recovery.
- [Native MainActivity](https://github.com/orcazen9-png/application-ewaste/blob/c4080d8d603ee3c7dfa0dd1e4707cb09f5368df7/native-android/app/src/main/java/com/ewaste/nativeapp/MainActivity.java): legacy lots, native photo flow, restricted general listing materials, basic offers/prices/earnings.
- [Native CollectorUi](https://github.com/orcazen9-png/application-ewaste/blob/c4080d8d603ee3c7dfa0dd1e4707cb09f5368df7/native-android/app/src/main/java/com/ewaste/nativeapp/CollectorUi.java): new marketplace, orders, contacts, profile, safety and manual retry.
- [Collector backend](https://github.com/orcazen9-png/application-ewaste/blob/c4080d8d603ee3c7dfa0dd1e4707cb09f5368df7/server/collector-market.js): separate market state, English profile, sample requirements and completion marking full payment.
- Supplied requirements: `C:/Users/Animesh Garg/Downloads/SIH_Local_Collector_Interface_PRD.docx` and original `docs/PRD.md`.

No new runtime testing was needed for this source/artifact audit. Prior v3 CI tests verify a specific set of native flows and update persistence, not parity with the original app or completion of every PRD requirement.
