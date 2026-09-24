# E-Waste Marketplace native v10

Aggregators can set a negotiable asking price per kg or piece for each material on the Post for recyclers screen. Recycler lot details and offer forms show this reference price. Empty prices remain “Price on request”. Posted-price changes are versioned and do not change accepted orders or settlement amounts. Recycler pays logistics separately.

Discovery shows the other business name, its facility or pickup locality and approximate straight-line distance. A saved facility or latest posted pickup location supplies the default origin; GPS or a confirmed city/area search can override it. Default results have no distance cutoff, sort located results nearest first, and retain entries without coordinates. Explicit radius filters still apply. Detail screens link to driving directions in Maps.

City lookup depends on the phone's geocoder and network. If coordinates are missing, the app shows distance unavailable; it does not invent road kilometres. Coordinates remain approximate. Map directions open an external map app/browser. Physical-device GPS and geocoding need a phone check.

Same package and permanent signing identity as v9. The release pipeline verifies a real v9-to-v10 update preserves stored drafts, photos and sign-in state, and runs backend/native/compact-screen checks before publication.
