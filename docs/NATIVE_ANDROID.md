# E-Waste Marketplace native Android demo

`native-android/` is a standalone Java/AppCompat application. Screens use Android Views without WebView or Capacitor.

Home → Create a lot → Take photo / Choose photo → Gemini suggestion → human confirmation or correction → Save draft / List lot. Drafts and compressed photos persist on the device. Connect once using the existing 48-character workspace pairing code in Settings. The code is encrypted with AndroidKeyStore. Gemini credentials remain on Cloudflare.

Classification covers 20 broad waste categories. Existing demo pricing/listing supports cables, circuit boards and motors; other equipment can be saved as an unpriced draft. Shared offers and earnings use the existing API. This demo does not implement the complete recycler/ERP or pickup/payment workflow.

Package: `com.ewaste.marketplace.nativeapp`, Android 8 or later. It installs separately to preserve the earlier app and data: its original signing key is unavailable. Builds use a cached demo signing certificate, not production signing. Cache retention does not guarantee a permanent upgrade key.

GitHub Actions compiles the app, verifies its signature and manifest, installs the release on an Android 16 emulator, and tests native photo processing, a simulated assessment, human correction and draft persistence. The test makes no paid Gemini request. Physical-device installation and live Gemini identification still require testing on the user's phone. Download the APK from the successful native workflow artifact; extract the ZIP and install the APK inside.
