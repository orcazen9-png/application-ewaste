# E-Waste Marketplace

Web and Android transaction prototype. Prices, buyers, pickup progress, and payments are simulated; no money moves.

## Working flows

- English, Hindi, Marathi; changing prices and 30-day histories.
- Photo-backed lots, offline drafts, original estimates, and activity history.
- Eligible fictional buyers, competing offers, explicit acceptance, and frozen rates.
- Pickup scheduling/rescheduling, simulated arrival, handover photos and manual location, buyer confirmation, and corrections that retain earlier evidence.
- Partial/full simulated payments, dues, printable receipts, and linked notifications.
- Labelled sample sales and sample-only reset that preserves user lots.
- Shared workspaces with durable D1 records and R2 photos, offline publication queues, atomic version checks, and idempotent transaction retries.

## Run and verify

Requires Node.js 22.13+ (24 recommended).

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

Open http://127.0.0.1:5173. SQLite and uploaded photos are stored in ignored `work/data/`. Tests use isolated temporary databases and verify concurrent HTTP requests, restart persistence, lost-response retries, stale edit recovery, preserved estimates, and payment arithmetic.

Client source is authored in `dist/`. Builds copy client assets to `dist/client/` and bundle the Worker at `dist/server/index.js`. Generated output is ignored. The existing Sites project uses D1/R2 bindings. Drizzle migrations own the production schema; runtime code never applies production schema changes.

## Connect devices

Open **Demo controls → Connect devices**. Create a workspace on the website, then enter the same server address and pairing code on another device. Drafts stay local. Existing listings upload their photos before publishing and preserve original estimates and basic activity history. A device with local in-progress/completed transactions must use a fresh browser profile to join, avoiding unsafe merges.

The pairing code is a 192-bit bearer capability. Anyone holding it can view and operate the entire demo workspace, including buyer simulation controls. The server stores its hash. This is a shared demo operator model, not separate production buyer/collector accounts. Codes, photos, and private records must never be committed to GitHub.

**Current hosting boundary:** the Site is owner-private and requires Sites sign-in. The APK runs the complete local demo, but cannot bypass that hosting gate for synchronization. APK synchronization requires an explicitly approved reachable deployment; workspace records would still require the pairing code. No Sites bypass credential is embedded in the APK. Audience changes are not automatic.

Stale listing edits become a recoverable draft while the latest server record loads. Accepted quotes and payments never overwrite newer records. Pending retries retain the original operation ID.

## Android

Each push to main runs **Build Android APK**. Download `ewaste-android-debug` from the successful run, extract it, and install `app-debug.apk` on Android 7+. Artifacts expire after 14 days.

```sh
npm run android:sync
npm run android:open
```

Local builds need JDK 21 and the Android SDK. Only client assets enter the APK; server code and migrations are excluded. This is a debug test build. Installation, camera permissions, speech, and receipt printing still need real-phone verification. Debug signing keys can differ between ephemeral GitHub runners; preserve device-only drafts before uninstalling an older build. Stable release signing remains to be configured.

## Demo walkthrough

1. Create and list a lot with photo, material, weight, and locality.
2. Expand eligible buyers, request an offer, review and accept it.
3. Schedule pickup. In buyer simulation controls, advance twice to arrived.
4. Submit actual weight, handover photo (or labelled sample), and manual location.
5. Simulate buyer confirmation, record a partial payment, inspect dues, then pay the remainder.
6. Open the receipt and Earnings; totals use the same handover and payment records.

## Remaining boundaries

- Shared capability access is for an owner-controlled demo. Separate role authorization, invitation expiry, and account recovery are not production-ready.
- Device GPS, automatic offer delivery, revised accepted-rate negotiation, live tracking, push notifications, and real payments are not implemented. In-app notifications and explicit simulation controls work.
- Browser receipt printing depends on WebView support on Android.
- Safety notes link to [WHO e-waste guidance](https://www.who.int/news-room/fact-sheets/detail/electronic-waste-(e-waste)). Buyer labels and receipts are not recycling certification.
- Seven moderate dependency audit findings affect build-time Capacitor iOS tooling and Drizzle's legacy esbuild loader. These modules are excluded from shipped runtime bundles. No forced major downgrades were applied.
