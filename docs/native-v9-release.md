# E-Waste Marketplace native v9

The existing native Android app now turns a lot photo into multiple editable material entries, including different equipment types sharing the same broad category. Gemini suggests pieces and visible counts; kg requires measured weight. Confirm each suggested item before posting. Applied photo references survive synchronization to avoid silently counting one photo twice.

Aggregators can explicitly post, pause or withdraw saved lots. Registered recyclers can browse posted material, filter by category and area, use approximate foreground GPS distance, and start an offer against a matching buying requirement. Each offer belongs to one material line. Offers and counteroffers carry a version; only the other party can accept the current offer. Conversations and notifications remain attached to the request and accepted order. Recycler-funded logistics, invoices and collector-confirmed settlement are unchanged.

The aggregator directory contains only consenting registered recyclers whose current facility submission has both a valid Freedom Value review and a separate government-source authorization check recorded by operations. Demo grants do not qualify. Business contacts, accepted materials, service areas, pickup and current indicative rates are shown; private supporting documents are never published. Operations must check the actual source: this release does not automatically query government registers.

Location is optional, requested only in the foreground, rounded to approximately a kilometre and used for approximate distance filtering (1–500 km). Manual city/area search works without GPS. Exact private pickup addresses remain in the existing order/logistics workflow. Conversations refresh through the in-app Refresh action and existing notification inbox; no typing indicators or background live tracking.

Install over v8 using the same permanent signing certificate and package `com.ewaste.marketplace.collector`. This is the Java/AppCompat native application. Cloudflare continues to host the API and private D1 demo storage. No Gemini API key is included in the APK.

Release checks: backend test suite, Android 16 instrumentation, compact display with large text, signed v8-to-v9 upgrade with saved-data preservation, certificate/package verification. Physical-phone GPS permission, camera and installation require a device check; emulator validation does not establish those results.
