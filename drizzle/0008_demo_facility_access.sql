CREATE TABLE `demo_facility_access` (
	`facility_id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE no action
);

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
      AND c.status='active' AND u.status='active' AND (f.verification_status='verified' OR EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=f.id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
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
      AND (f.verification_status='verified' OR EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=f.id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AND c.status='active' AND u.status='active'
      AND NEW.collector_id=s.collector_id AND NEW.recycler_id=s.recycler_id AND NEW.facility_id=r.facility_id
      AND NEW.material_paise=coalesce(s.ask_paise,json_extract(s.snapshot_json,'$.estimatePaise'))
      AND (r.detailed_code IS NULL OR
        r.detailed_code=(SELECT json_extract(message,'$.code') FROM market_events WHERE request_id=s.id AND kind='category.confirmed' ORDER BY CAST(json_extract(message,'$.requestVersion') AS INTEGER) DESC LIMIT 1))
      AND i.quantity_base-coalesce((SELECT sum(quantity_base) FROM reservations WHERE lot_id=s.lot_id AND item_id=s.item_id AND state IN ('held','consumed')),0)>=s.quantity_base
      AND (r.target_base IS NULL OR r.target_base-coalesce((SELECT sum(coalesce(demand_base,quantity_base)) FROM reservations WHERE requirement_id=r.id AND state IN ('held','consumed')),0)>=s.quantity_base)
  );
END;
