# E-Waste Marketplace

A lightweight web and Android prototype for e-waste collectors. All price data is fictional and clearly labelled as simulated.

## Foundation available now

- English, Hindi, and Marathi collector interfaces.
- Three materials across Mumbai, Thane, and Navi Mumbai.
- Persistent, changing simulated prices and 30-day history.
- Photo uploads, weight-based estimates, drafts, and local listings.
- Stable lot IDs, original valuation snapshots, and activity history.
- Shared local collector and buyer-preview records.
- Service-worker app caching and IndexedDB persistence for drafts/photos.
- Earnings summaries derived from confirmed transaction records; no fabricated income.

## Run and verify

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm run check
npm test
```

Open http://127.0.0.1:5173. The web source is authored directly in `dist/`; there is no web bundling step. Hash navigation and relative asset paths support static hosting in a repository subdirectory.

## Current boundaries

This milestone stores data on the current device. Buyer preview uses the same local records. No backend or cross-device synchronization is connected yet. An offline-mode demo control pauses the simulated market; it does not disconnect the network. Test real offline operation using airplane mode after the app has cached successfully.

Offers, pickup, handover, and payment interactions are the next milestone. The domain model reserves these connected records, but those workflows are not presented as working features.

The repository contains source and tests only. User-created lot photos and records stay in browser/device storage and are not uploaded to GitHub.

## Structure

- `dist/domain.js`: deterministic price generation, valuation, lot transitions, ledger calculations.
- `dist/store.js`: atomic IndexedDB transactions and photo persistence.
- `dist/app.js`: screens and actions.
- `dist/i18n.js`: English, Hindi, Marathi UI copy.
- `dist/sw.js`: offline app cache.
- `tests/`: business-rule checks.
- `scripts/`: local preview and static validation.

## Android

The Android wrapper uses Capacitor and packages the same `dist/` assets. Every push to `main` runs the **Build Android APK** GitHub workflow. After it succeeds, download `ewaste-android-debug` from that run’s artifacts, extract it, and install `app-debug.apk` on Android 7 or newer.

For local Android builds, install the JDK/Android SDK required by [Capacitor’s environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), then run:

```sh
npm run android:sync
npm run android:open
```

The APK is a debug build for testing. It is not a Play Store release. Device installation, camera permissions, and Android speech availability still require real-phone verification. Generated artifacts are retained by GitHub Actions for 14 days.

The current Capacitor CLI dependency tree has three moderate audit findings in its iOS build tooling (`xcode`/`uuid`). The shipped web app has no such runtime dependencies; Android and web build checks pass. Review the build-tool dependency update before production release.

## Demo limitations

Simulated prices are not actual market rates. Buyer-preview records are not proof of recycler authorization. The app does not transfer money or certify recycling.
