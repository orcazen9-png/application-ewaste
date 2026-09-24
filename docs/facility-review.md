# Facility onboarding and review

The native Recycler workspace links to **Your facility** from Home and Profile. Its Business, Services and Documents steps retain a private local draft per account. The final submission uploads up to five PDF/JPEG/PNG files (5 MB each), then saves the profile using a versioned, retry-safe command. Android's document picker is used; private files require the account session to upload or read.

Freedom Value staff with the `operations` or `operations_finance` role review submissions in **ERP → Facility reviews**. Finance-only and viewer accounts cannot read the queue or evidence. Staff see the submitted material scope, facility/contact/service information, issuing authority/reference, document expiry, supporting files and immutable submitted revisions. Approval requires an evidence-source reference, a reason visible to the recycler and an expiry within one year that does not outlast a declared document expiry. Rejection or withdrawal also requires a reason and source.

This is explicitly a Freedom Value document review. It does not query a government register or confer CPCB certification. Staff must establish suitable review criteria and independently check evidence; the software does not infer authenticity from an upload or from Gemini.

## State and permissions

- New registrations are unverified. A local draft does not enable trading.
- Submission changes the facility to pending. Submission of changes ends the previous approval until a reviewer approves the new version.
- Approved facilities can publish, match and accept new business only within the reviewed broad material categories and while the approval is current.
- Rejected, withdrawn or expired approvals cannot establish new trading commitments. Existing orders and their physical/financial history remain intact.
- Review changes are version checked; retries return the earlier result. Concurrent decisions cannot silently overwrite each other. SQL guards also check eligibility when requirements, requests or orders are written.
- The pre-existing, explicitly expiring demo grant remains separate and is displayed as demo access. It does not approve the facility. Existing manually verified records without a new review profile retain their previous behavior; they should be migrated to evidence-backed review before production.

## Storage and routes

Migration `0010_facility_review.sql` adds current profiles, immutable submission snapshots, review history and owned document metadata. Evidence uses the existing private D1-backed object adapter. The global demo allowance is 200 MB of raw files; each recycler has a facility-evidence allowance of 100 files / 50 MB. Replacing a document requires a new ID; earlier submitted evidence remains available to authorized reviewers.

Personal routes: `GET/PUT /api/v1/facility`, `GET/PUT /api/v1/facility/documents/:id`.

Operations routes: `GET /api/ops/facilities`, `GET /api/ops/facilities/:id`, `POST /api/ops/facilities/:id/review`, `GET /api/ops/facilities/:id/documents/:documentId`.

Native form fields and controls have English, Hindi and Marathi translations. Submitted descriptions, business details, evidence and reviewer notes keep their original language.

## Validation and remaining release checks

Backend tests cover the complete review lifecycle, immutable revisions, private evidence, disallowed staff roles, stale/concurrent commands, approval expiry and scope, notifications and preservation of existing orders. The real ERP page was exercised against isolated local fixtures and its approval form saved the reason, source, expiry and original revision correctly.

The Cloudflare migration was applied after exporting the existing database and restoring it in isolated SQLite with integrity and foreign-key checks. Live API checks passed private D1 PDF roundtrip, unauthenticated denial, submission/replay, staff approval/replay, recycler notification, withdrawal and logout. Temporary QA identities were suspended and their sessions revoked. Their clearly labeled synthetic evidence remains private for the audit trail.

Native instrumentation covers document import, draft recreation, interrupted submission, replay with the same command and pending-status rendering. Physical phone document-picker, camera, full two-party transaction and native-speaker translation review still require validation. Password recovery, government-registry integration, automated approval-expiry notifications, R2 migration and production retention/recovery policy remain future work.

Signed native v8 was published from `5e662bf5c1594f62c7f1381c54f01d869f6c25d3`. Release run `35957234641` passed the actual v7 upgrade, all 18 native tests and two compact-font checks; the final independent run `35957234643` also passed. Anonymous APK download, SHA-256 and the permanent certificate were verified.
