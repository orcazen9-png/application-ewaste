# Gemini identification demo

Open `/identify.html` from the marketplace home page. This connected demonstration has aggregator (20 broad categories), recycler/refurbisher (106 detailed codes) and ERP tabs. Tabs are workflow previews for the same paired workspace, not role-based security. Production organisation memberships and role permissions remain future work.

## Local setup

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` and `GEMINI_MODEL` locally. `.env` is ignored by Git and is never copied into browser assets. Restart `npm run dev` after changes, then open http://127.0.0.1:5173/identify.html. For hosted operation, configure equivalent server secrets in the hosting environment; never put them in frontend code. No deployment is included.

Tested model: `gemini-3.1-flash-lite` with thinking disabled (the default here). Measured on real photos, "photo saved → categories shown" took 1.8–8.5 s; about half of the runs were under 5 s. The slow runs were Google-side delays that affected a backup request at the same moment. `gemini-3.8-flash` was slower (10–60 s) and often returned "overloaded". Optional backend settings:

| Setting | Default | Purpose |
|---|---|---|
| `GEMINI_THINKING_BUDGET` | `0` | Model thinking; off because it added tens of seconds without better categories. Models that reject the setting are retried without it. |
| `GEMINI_HEDGE_MS` | `2500` | If Google has not answered, send one backup request and use the first answer. `0` disables. |
| `GEMINI_MEDIA_RESOLUTION` | unset | `MEDIA_RESOLUTION_LOW`/`MEDIUM`/`HIGH`. Low resolution was not faster in testing and missed a phone in a crowded lot. |

## Workflow

1. Start/connect a shared demo workspace. Existing marketplace pairing can be reused.
2. Aggregator: add a photo, description, quantity, price basis and asking price. Saving stores the photo and **immediately sends it to Google Gemini** for the broad assessment (the form says so). The recycler's detailed assessment is then prepared in the background.
3. A lot photo can contain several equipment types. Each assessment lists every type it can see, with visible evidence and an approximate count only when units are clearly countable. Repeats of one category are merged.
4. A person ticks, unticks or adds categories and saves them, or records **Not e-waste** or **Needs a better photo**. Each decision keeps the original AI suggestion beside it and is marked confirmed or corrected.
5. Recycler: the same photo is assessed against all 106 codes. The broad decision does not limit this list. Codes that a photo cannot separate (laptop/notebook/notepad, phone/phablet/tablet, telecom vs audio/video, display, sewing, medical, laboratory) always show a "check the specification" warning.
6. ERP: both assessments, both human decisions, the asking price, buyer offers and history. Offers are not accepted contracts, settlements or payments. Existing material-price transactions remain separate.

## Behaviour and limits

Photo bytes use the existing private workspace object store (local filesystem in development). Item metadata and immutable assessment/decision/offer records use the existing SQLite/D1 workspace state with optimistic concurrency. Responses are validated against the allowed scope; the listed items decide the status, so a mislabelled status never invents or hides a category. Repeated assessments of the same item/scope/model/taxonomy reuse the saved result.

Missing key/model, quota (429), overload (503), unknown model (404), rejected key (403), timeout and malformed answers each show a specific error; there are no simulated AI answers. No confidence scores or prices are produced. A photo cannot establish functionality, material composition or refurbishment suitability.

Verified with real photos: a mixed bin (laptop, desktop, phones, cables), a single phone, a blurry laptop, a coin and a pillow. Non-electronic photos were not forced into a category. Known gaps: the 20 broad categories have no place for loose cables and chargers; a person cannot correct the counts; there is no "waiting for specification" state.

Up to 100 submissions per workspace. Fine-grained roles, distributed rate limits, retention/deletion tools and production-scale assessment tables are required before public rollout. There is no automatic photo-to-training pipeline. Automated tests use mocked Gemini responses with the real local SQLite/object-store API.

API references: https://ai.google.dev/gemini-api/docs/generate-content/image-understanding and https://ai.google.dev/gemini-api/docs/generate-content/structured-output
