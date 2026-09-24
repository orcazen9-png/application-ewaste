CREATE TABLE facility_profiles (
 facility_id TEXT PRIMARY KEY NOT NULL REFERENCES facilities(id),
 version INTEGER NOT NULL CHECK(version>0),
 status TEXT NOT NULL CHECK(status IN ('draft','pending','approved','rejected')),
 profile_json TEXT NOT NULL,
 submitted_version INTEGER,
 valid_until TEXT,
 updated_at TEXT NOT NULL
);
CREATE TABLE facility_submissions (
 facility_id TEXT NOT NULL REFERENCES facilities(id),
 version INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(facility_id,version)
);
CREATE TABLE facility_reviews (
 id TEXT PRIMARY KEY NOT NULL,
 facility_id TEXT NOT NULL REFERENCES facilities(id),
 submission_version INTEGER NOT NULL,
 reviewer_id TEXT NOT NULL REFERENCES operations_staff(id),
 decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
 reason TEXT NOT NULL,
 source TEXT NOT NULL,
 valid_until TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX facility_reviews_history ON facility_reviews(facility_id,created_at);
CREATE TABLE facility_documents (
 id TEXT PRIMARY KEY NOT NULL,
 facility_id TEXT NOT NULL REFERENCES facilities(id),
 owner_user_id TEXT NOT NULL REFERENCES users(id),
 object_key TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 5242880),
 sha256 TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('uploading','ready')),
 created_at TEXT NOT NULL
);
CREATE INDEX facility_documents_owner ON facility_documents(owner_user_id);

--> statement-breakpoint

DROP TRIGGER request_guard;
--> statement-breakpoint
CREATE TRIGGER request_guard BEFORE INSERT ON supply_requests BEGIN
  SELECT RAISE(ABORT,'MARKET_CONFLICT: Requirement or draft changed. Refresh and review before submitting.') WHERE NOT EXISTS (
    SELECT 1 FROM requirements r JOIN facilities f ON f.id=r.facility_id
    JOIN lots l ON l.id=NEW.lot_id JOIN lot_items i ON i.lot_id=l.id AND i.id=NEW.item_id
    JOIN users c ON c.id=NEW.collector_id JOIN users u ON u.id=r.owner_id
    WHERE r.id=NEW.requirement_id AND r.owner_id=NEW.recycler_id AND r.version=NEW.requirement_version
      AND l.owner_user_id=NEW.collector_id AND l.version=NEW.lot_version
      AND c.status='active' AND u.status='active' AND ((f.verification_status='verified' AND (NOT EXISTS(SELECT 1 FROM facility_profiles fp WHERE fp.facility_id=f.id) OR EXISTS(SELECT 1 FROM facility_profiles fp,json_each(fp.profile_json,'$.categories') j WHERE fp.facility_id=f.id AND fp.status='approved' AND fp.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND j.value=r.broad_code))) OR EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=f.id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      AND r.state='active' AND r.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND i.review_state='confirmed' AND i.broad_code=r.broad_code AND i.unit=r.unit AND NEW.unit=r.unit
      AND (r.detailed_code IS NULL OR i.detailed_code IS NULL OR r.detailed_code=i.detailed_code)
      AND NEW.quantity_base>=r.minimum_base AND i.quantity_base>=NEW.quantity_base
      AND EXISTS(SELECT 1 FROM json_each(r.areas_json) WHERE value=lower(trim(l.locality)))
      AND EXISTS(SELECT 1 FROM json_each(r.modes_json) WHERE value=NEW.mode)
  );
END;

--> statement-breakpoint
DROP TRIGGER order_guard;
--> statement-breakpoint
CREATE TRIGGER order_guard BEFORE INSERT ON orders BEGIN
  SELECT RAISE(ABORT,'MARKET_CONFLICT: Supply, demand or reviewed terms changed. Refresh the request.') WHERE NOT EXISTS (
    SELECT 1 FROM supply_requests s JOIN requirements r ON r.id=s.requirement_id
    JOIN lots l ON l.id=s.lot_id JOIN lot_items i ON i.lot_id=l.id AND i.id=s.item_id
    JOIN facilities f ON f.id=r.facility_id JOIN users c ON c.id=s.collector_id JOIN users u ON u.id=s.recycler_id
    WHERE s.id=NEW.request_id AND s.state IN ('submitted','clarification')
      AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND r.state='active' AND r.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND r.version=s.requirement_version AND l.version=s.lot_version
      AND ((f.verification_status='verified' AND (NOT EXISTS(SELECT 1 FROM facility_profiles fp WHERE fp.facility_id=f.id) OR EXISTS(SELECT 1 FROM facility_profiles fp,json_each(fp.profile_json,'$.categories') j WHERE fp.facility_id=f.id AND fp.status='approved' AND fp.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND j.value=r.broad_code))) OR EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=f.id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AND c.status='active' AND u.status='active'
      AND NEW.collector_id=s.collector_id AND NEW.recycler_id=s.recycler_id AND NEW.facility_id=r.facility_id
      AND NEW.material_paise=coalesce(s.ask_paise,json_extract(s.snapshot_json,'$.estimatePaise'))
      AND (r.detailed_code IS NULL OR
        r.detailed_code=(SELECT json_extract(message,'$.code') FROM market_events WHERE request_id=s.id AND kind='category.confirmed' ORDER BY CAST(json_extract(message,'$.requestVersion') AS INTEGER) DESC LIMIT 1))
      AND i.quantity_base-coalesce((SELECT sum(quantity_base) FROM reservations WHERE lot_id=s.lot_id AND item_id=s.item_id AND state IN ('held','consumed')),0)>=s.quantity_base
      AND (r.target_base IS NULL OR r.target_base-coalesce((SELECT sum(coalesce(demand_base,quantity_base)) FROM reservations WHERE requirement_id=r.id AND state IN ('held','consumed')),0)>=s.quantity_base)
  );
END;

--> statement-breakpoint
CREATE TRIGGER facility_requirement_insert BEFORE INSERT ON requirements WHEN NEW.state='active' BEGIN
 SELECT RAISE(ABORT,'MARKET_CONFLICT: Facility review changed. Refresh before publishing.') WHERE EXISTS(SELECT 1 FROM facility_profiles fp WHERE fp.facility_id=NEW.facility_id) AND NOT EXISTS(SELECT 1 FROM facility_profiles fp,json_each(fp.profile_json,'$.categories') j WHERE fp.facility_id=NEW.facility_id AND fp.status='approved' AND fp.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND j.value=NEW.broad_code) AND NOT EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=NEW.facility_id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

--> statement-breakpoint
CREATE TRIGGER facility_requirement_update BEFORE UPDATE ON requirements WHEN NEW.state='active' BEGIN
 SELECT RAISE(ABORT,'MARKET_CONFLICT: Facility review changed. Refresh before publishing.') WHERE EXISTS(SELECT 1 FROM facility_profiles fp WHERE fp.facility_id=NEW.facility_id) AND NOT EXISTS(SELECT 1 FROM facility_profiles fp,json_each(fp.profile_json,'$.categories') j WHERE fp.facility_id=NEW.facility_id AND fp.status='approved' AND fp.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND j.value=NEW.broad_code) AND NOT EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=NEW.facility_id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
