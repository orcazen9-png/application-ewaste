# E-Waste Marketplace native Android demo

`native-android/` is a standalone Java/AppCompat application. Screens use Android Views without WebView or Capacitor.

Home → Create a lot → Take photo / Choose photo → Gemini suggestion → human confirmation or correction → Save draft / List lot. Drafts and compressed photos persist on the device. Connect once using the existing 48-character workspace pairing code in Settings. The code is encrypted with AndroidKeyStore. Gemini credentials remain on Cloudflare.

Version 2 adds native Home, Orders, Scan, Contacted and Profile navigation, seven illustrative recycler requirements, category/service-area filtering, comparable quote sorting, requirement details, quantity in kg or pieces, contacts, order timelines, cancellation, notifications, profile editing and safety guidance. The central Scan button connects the existing 20-category photo flow to matching requirements. Existing lots remain available from Orders/Profile.

Cloudflare Workers and D1 remain the backend. Collector marketplace data is added under `collectorMarket` in each existing workspace, without replacing earlier lots or operation receipts. Price, unit, quote version and quantity are checked by the server. Order prices are snapshotted; final quantity determines the confirmed value. Request IDs and saved pending actions support retries without duplicate orders. Unavailable legacy prices now show “Price on request”.

The marketplace is a labelled prototype. Recycler identities and quotes are fictional; authorization is not verified. Contact records send no messages. Order acceptance, receipt and payment buttons simulate recycler actions; no money moves. Requirements expire on 23 October 2026 and are checked again by the server. Notifications are an in-app inbox refreshed from the workspace, not push delivery.

Real mobile OTP, individual accounts/role permissions, translated interfaces, live recycler verification, real messaging, and payment integration are not enabled. Access still uses the existing shared workspace pairing code. The recycler/ERP interfaces remain separate work.

Package: `com.ewaste.marketplace.nativeapp`, Android 8 or later. It installs separately to preserve the earlier app and data: its original signing key is unavailable. Builds use a cached demo signing certificate, not production signing. Cache retention does not guarantee a permanent upgrade key.

GitHub Actions compiles the app, verifies its signature and manifest, installs the release on an Android 16 emulator, and tests native photo processing, a simulated assessment, human correction and draft persistence. Version 2 also tests marketplace navigation, contact and order creation, and recovery of an interrupted request across Activity recreation. These tests make no paid Gemini requests. Physical-device installation and live Gemini identification still require testing on the user's phone. Download the APK from the successful native workflow artifact; extract the ZIP and install the APK inside.

Safety cards cite [EPA battery handling guidance](https://www.epa.gov/recycle/used-lithium-ion-batteries) and [damaged battery guidance](https://www.epa.gov/recycle/frequent-questions-lithium-ion-batteries). They do not assert Indian regulatory authorization for sample recyclers.
