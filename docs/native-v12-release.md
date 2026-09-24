# E-Waste Marketplace native v12

Delete lot is now a visible red-text button on each lot card in My lots and Recent lots. It is also available at the top of the aggregator's posted-lot screen. The existing review-screen action remains available.

Deletion still asks for confirmation, removes the lot from discovery and other signed-in devices, and preserves conversation and transaction history. Active orders still protect reserved stock. No backend or data migration is needed for this update.

The native UI test checks that the first lot's Delete lot button is visible on normal and compact screens, deletes through that button, and verifies that refresh cannot restore the deleted lot. The signed release uses the same app identity and tests an actual v11-to-v12 update.
