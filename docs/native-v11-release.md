# E-Waste Marketplace native v11

Aggregators can delete a local or online lot from its review screen. Deletion removes it from My lots and posted-material discovery, withdraws pending proposals, and synchronizes the removal to other devices. Conversations, photos shared in transactions and order records remain available. Held stock blocks deletion until the active order is resolved. Pending uncertain draft saves must sync first.

Both roles have an Offers & chats entry. Start a lot conversation from recycler discovery, the authorized recycler directory, an offer or an order. Messages retain account scoping, survive retries and have older-message pagination. The composer remains visible below the scrolling conversation. Messages refresh every 10 seconds while the chat is open and the composer is not focused; Refresh is also available. Background instant push is not part of this release.

Incoming offers show Accept offer inside the conversation. This accepts the counterparty's current offer, with a confirmation dialog and the existing category/stock/version checks. It does not accept a public asking price automatically. Each party can review and counter offers. Existing offer messages appear in the corresponding conversation.

Same package and permanent signing identity as v10. The release pipeline tests the actual v10-to-v11 update and retained drafts, photos and sign-in state, plus backend, native Android and compact-screen tests.
