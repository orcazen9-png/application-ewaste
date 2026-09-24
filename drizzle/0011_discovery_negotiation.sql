ALTER TABLE lots ADD COLUMN assessment_photos_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE lot_items ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_requests ADD COLUMN proposed_by TEXT REFERENCES users(id);
ALTER TABLE supply_requests ADD COLUMN offer_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE supply_requests ADD COLUMN listing_version INTEGER;
CREATE TABLE lot_listings (
 lot_id TEXT PRIMARY KEY NOT NULL REFERENCES lots(id),
 owner_id TEXT NOT NULL REFERENCES users(id),
 lot_version INTEGER NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 state TEXT NOT NULL CHECK(state IN ('posted','paused','withdrawn')),
 latitude REAL, longitude REAL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
CREATE INDEX listing_state ON lot_listings(state,lot_id);
CREATE TABLE directory_authorizations (
 facility_id TEXT PRIMARY KEY NOT NULL REFERENCES facilities(id),
 submission_version INTEGER NOT NULL, version INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('verified','revoked')),
 source TEXT NOT NULL, valid_until TEXT NOT NULL,
 reviewer_id TEXT NOT NULL REFERENCES operations_staff(id), checked_at TEXT NOT NULL
);
CREATE TABLE directory_authorization_history (
 id TEXT PRIMARY KEY NOT NULL, facility_id TEXT NOT NULL REFERENCES facilities(id),
 version INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER listing_offer_guard BEFORE INSERT ON supply_requests WHEN NEW.listing_version IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'MARKET_CONFLICT: Posted lot changed or is no longer available.') WHERE NOT EXISTS(
 SELECT 1 FROM lot_listings p WHERE p.lot_id=NEW.lot_id AND p.lot_version=NEW.lot_version AND p.version=NEW.listing_version AND p.state='posted');
END;
--> statement-breakpoint
CREATE TRIGGER listing_order_guard BEFORE INSERT ON orders BEGIN
 SELECT RAISE(ABORT,'MARKET_CONFLICT: Posted lot changed or is no longer available.') WHERE EXISTS(
 SELECT 1 FROM supply_requests s WHERE s.id=NEW.request_id AND s.listing_version IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM lot_listings p WHERE p.lot_id=s.lot_id AND p.lot_version=s.lot_version AND p.version=s.listing_version AND p.state='posted'));
END;
