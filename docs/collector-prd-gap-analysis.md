# Collector PRD comparison with the native Android app

Reviewed 23 September 2026 against SIH_Local_Collector_Interface_PRD.docx and the native app at commit edcf59c.

The current APK implements photo identification, human category review, local drafts, basic listing and demo buyer offers. It does not yet meet the PRD's complete collector marketplace journey. This is a source-code comparison, not a new physical-device test or a claim of production readiness.

## Scope and interpretation

- Keep native Android, following the user's explicit requirement. The PRD's web/PWA platform wording and embedded application-generation prompt do not change that instruction.
- Keep the current E-Waste Marketplace name unless a rename to ScrapOS Collector is requested.
- Use the five destinations specified in section 8 and Appendix A: Home, Orders, central Scan, Contacted and Profile. Section 4's shorter navigation table omits Contacted, while the later specification includes it explicitly.
- Preserve the 20 broad collector categories and the existing Cloudflare/Gemini connection. Recycler-side 106-category work is outside this collector comparison.

## Requirement coverage

| PRD area | Current native implementation | Gap |
| --- | --- | --- |
| AUTH-01–05 and profile | Persistent encrypted workspace pairing code; local app opens without sign-in | No OTP, individual account, onboarding, language selection, profile editing or logout |
| HOME-01–06 | Create Lot action, active-lot count, recent lots and indicative material prices | No personalized greeting, recycler demand feed, filtering, dedicated active-order summary or safety shortcut |
| Navigation and SCAN-01 | Home, Prices, My Lots and Earnings | Central camera action and Orders, Contacted, Profile destinations absent |
| SCAN-02–04 | Android camera intent, gallery picker, photo compression, backend assessment, loading/error text, confirmation and correction | No separate scan/result screens or embedded camera preview/flash controls; no numeric confidence score is returned/displayed |
| SCAN-05 | Weight in kg, location and condition inputs | No pieces/unit selector; listing/pricing limited to cables, PCB and motors |
| SCAN-06 | Confirmation stored separately from the model assessment | No immediate matching recycler requirements after identification |
| MKT-01–06 and recycler details | Demo buyer offers can be requested and accepted on a listed lot | No demand entity/feed, expiry, requested quantity, verification record, quote comparison, requirement details or contact/report flow |
| ORD-01–05 | Lots have IDs/status; basic details and offer acceptance; backend has pickup, handover, cancellation and payment commands | Native Orders tabs, transaction summary, timeline and full completion/cancellation controls absent |
| CON-01–04 | No contact-history entity or screen | Need separate contact records, interaction status and resume action; requesting a simulated offer is not a real recycler contact |
| Safety | No safety destination or content | Need short illustrated guidance and category-specific warnings, with reviewed source material |
| Notifications | No notification inbox or event delivery | Need relevant event records, read status and navigation to the associated screen |
| Pricing | Cached backend demo prices, with hard-coded fallback values; prices explicitly labelled simulated | Requirement-specific price/unit, expiry and quantity handling missing. Replace unavailable-price fallback with “Price on request” to meet the PRD |
| Offline and edge cases | Local photo/draft persistence, cached shared state, error messages and manual listing retry | Clear offline/stale-data indicators, comprehensive permission/failure states and expired-requirement handling still needed |
| Security and privacy | HTTPS, server-side Gemini key, encrypted pairing credential and workspace-scoped API access | Shared workspace access is not individual authentication or role-based authorization; add collector ownership and recycler roles before multi-user rollout |
| Analytics and audit | Backend transaction events, timestamps and idempotent command receipts | Login, scan, confirmation, marketplace, contact and safety engagement events not implemented |

## Data changes required

Retain photos, assessments, human decisions and existing transaction history. Add collector profiles, recycler records, recycler requirements, contacts, safety content and notifications. Relate orders to the collector, recycler and requirement, keeping the agreed quote and unit as a snapshot so later price changes do not alter the agreement.

Broad AI categories are not pricing materials. Store an explicit mapping between confirmed equipment/material and eligible requirements, and let the collector confirm the sale item and quantity. Do not silently price every item in a broad category alike.

The current backend uses integer paise and weights in grams. Extend quantity validation and calculations to support pieces and other allowed units. Enforce expiry, ownership and transaction-state rules on the backend as well as in the app.

## Recommended implementation order

1. Define and implement requirements, recycler, contact and order contracts with explicitly labelled demo data. Preserve existing workspace records and add migration defaults for new fields.
2. Build native Home demand cards and the five-tab navigation with a prominent central Scan action. Add Profile, Contacted and safety destinations.
3. Connect the existing photo/confirmation flow to quantity/unit entry, matching requirements, comparison and requirement details. Show uncertainty text when numerical confidence is unavailable.
4. Implement contact history and the complete native order journey, using the existing transaction backend where appropriate. Include order references, agreed values, status history and earnings.
5. Add OTP authentication and collector-specific access, language preference, notifications and analytics. Real OTP requires an SMS/authentication service; a labelled demo sign-in must not be represented as real OTP verification.
6. Verify the complete collector journey, expired quotes, unit calculations, ownership isolation, offline retries and camera/gallery behavior. Build the APK and test on the user's Android 16 phone.

For an initial demonstration, sample recycler demand, orders and contacts can follow the PRD's prototype examples, clearly marked as demo records. Actual recycler authorization or live quotes must not be implied by those fixtures.

## Evidence and testing limits

- `native-android/app/src/main/java/com/ewaste/nativeapp/MainActivity.java`: native screens, photo flow, pricing fallbacks, lot operations and workspace connection.
- `native-android/app/src/main/java/com/ewaste/nativeapp/LocalStore.java`: drafts, cached state, photo files and encrypted pairing credential.
- `native-android/app/src/main/java/com/ewaste/nativeapp/ApiClient.java`: HTTPS backend requests with workspace bearer code.
- `server/worker.js`: workspace authorization, photo storage, assessment and transaction endpoints.
- `dist/domain.js` and `dist/transactions.js`: three pricing materials, demo buyers, transaction states and event history.
- `native-android/app/src/androidTest/java/com/ewaste/nativeapp/NativeFlowTest.java`: photo processing with a simulated assessment, human correction and draft persistence across Activity recreation. It does not exercise real camera capture, real SMS, live Gemini, order completion or phone installation.

The prior successful CI run installed and launched the release APK on an Android 16 emulator and ran the native flow test. No additional runtime tests were run for this read-only comparison. Application code and deployment are unchanged by this report.
