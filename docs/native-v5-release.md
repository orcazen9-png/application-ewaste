Native Android demo for collector and recycler accounts, backed by a separate Cloudflare service. The app uses Android Views, camera/gallery and local account storage.

- Personal one-time invitations; roles and sessions are issued by the server.
- Lots, buying requirements, matching, shared orders, pickup and receipt evidence.
- Private PDF/photo invoices, versioned reviews, partial external settlements, collector receipt confirmation and disputes.
- Earnings, durable inbox, Hindi/Marathi controls and periodic Android notifications.
- [Freedom Value ERP](https://ewaste-accounts-demo.ewaste-marketplace.workers.dev/operations.html) for authorized staff: logistics, separate ledgers, financial records, analytics and CSV export.

Download the `.apk` directly on Android. This release uses the same signing certificate and package as native v4. The build tests an update from the actual previously distributed v4 APK on an Android 16 emulator. Physical-phone verification is separate. Do not uninstall an existing app to resolve an error without preserving its unsynced records.

Obtain your individual invitation from the project owner. Invitations and Gemini credentials are not included in this public release. Payments are recorded, not transferred by the app. This is a demo environment; SMS sign-in, instant push delivery and government verification are not configured. The invited demo recycler has time-limited sandbox access; this does not certify its facility. Android controls when background inbox checks run. Private D1 document storage has a 200 MB demo allowance.

Earlier workspace data is retained in the same package but is not automatically assigned to personal accounts. The owner must review any migration. All 20 broad and 106 detailed category labels have Hindi and Marathi translations. Known validation messages and statuses are localized. People’s notes and historical model evidence retain their original language; optional technical diagnostics retain the original error. New Gemini requests ask for explanations in the account’s selected language.

This update adds older-notification navigation, actionable ERP queues, recycler/state filters, request conversion and category-review counts.
