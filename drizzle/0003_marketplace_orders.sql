-- Additive marketplace tables. Guard triggers below are part of the migration contract.
CREATE TABLE `account_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`file_id` text NOT NULL,
	`request_id` text,
	`scope` text NOT NULL,
	`state` text NOT NULL,
	`result_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `supply_requests`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessment_state" CHECK("account_assessments"."state" IN ('running','ready','failed'))
);
--> statement-breakpoint
CREATE INDEX `assessments_actor` ON `account_assessments` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `supply_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `market_events_request` ON `market_events` (`request_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `order_terms` (
	`order_id` text NOT NULL,
	`version` integer NOT NULL,
	`proposed_by` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`acknowledged_by` text,
	`created_at` text NOT NULL,
	`acknowledged_at` text,
	PRIMARY KEY(`order_id`, `version`),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "terms_status" CHECK("order_terms"."status" IN ('acknowledged','proposed','superseded')),
	CONSTRAINT "terms_amount" CHECK("order_terms"."amount_paise">=0)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`collector_id` text NOT NULL,
	`recycler_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL,
	`material_paise` integer NOT NULL,
	`terms_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `supply_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collector_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recycler_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_state" CHECK("orders"."state" IN ('accepted','cancelled')),
	CONSTRAINT "order_numbers" CHECK("orders"."material_paise">=0 AND "orders"."version">0 AND "orders"."terms_version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_request_id_unique` ON `orders` (`request_id`);--> statement-breakpoint
CREATE INDEX `orders_collector` ON `orders` (`collector_id`,`id`);--> statement-breakpoint
CREATE INDEX `orders_recycler` ON `orders` (`recycler_id`,`id`);--> statement-breakpoint
CREATE TABLE `request_files` (
	`request_id` text NOT NULL,
	`file_id` text NOT NULL,
	PRIMARY KEY(`request_id`, `file_id`),
	FOREIGN KEY (`request_id`) REFERENCES `supply_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirement_revisions` (
	`requirement_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`requirement_id`, `version`),
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`broad_code` text NOT NULL,
	`detailed_code` text,
	`title` text NOT NULL,
	`specification` text NOT NULL,
	`unit` text NOT NULL,
	`rate_paise` integer NOT NULL,
	`minimum_base` integer NOT NULL,
	`target_base` integer,
	`areas_json` text NOT NULL,
	`modes_json` text NOT NULL,
	`valid_until` text NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requirement_state" CHECK("requirements"."state" IN ('active','paused')),
	CONSTRAINT "requirement_unit" CHECK("requirements"."unit" IN ('kg','piece')),
	CONSTRAINT "requirement_numbers" CHECK("requirements"."rate_paise">0 AND "requirements"."minimum_base">0 AND ("requirements"."target_base" IS NULL OR "requirements"."target_base">="requirements"."minimum_base") AND "requirements"."version">0)
);
--> statement-breakpoint
CREATE INDEX `requirements_owner` ON `requirements` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `requirements_discovery` ON `requirements` (`broad_code`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`order_id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity_base` integer NOT NULL,
	`state` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservation_state" CHECK("reservations"."state" IN ('held','released','consumed')),
	CONSTRAINT "reservation_quantity" CHECK("reservations"."quantity_base">0)
);
--> statement-breakpoint
CREATE INDEX `reservations_demand` ON `reservations` (`requirement_id`,`state`);--> statement-breakpoint
CREATE INDEX `reservations_supply` ON `reservations` (`lot_id`,`item_id`,`state`);--> statement-breakpoint
CREATE TABLE `supply_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`collector_id` text NOT NULL,
	`recycler_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`requirement_version` integer NOT NULL,
	`lot_id` text NOT NULL,
	`lot_version` integer NOT NULL,
	`item_id` text NOT NULL,
	`quantity_base` integer NOT NULL,
	`unit` text NOT NULL,
	`mode` text NOT NULL,
	`ask_paise` integer,
	`snapshot_json` text NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`collector_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recycler_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "request_state" CHECK("supply_requests"."state" IN ('submitted','clarification','accepted','rejected','withdrawn')),
	CONSTRAINT "request_values" CHECK("supply_requests"."quantity_base">0 AND "supply_requests"."version">0 AND ("supply_requests"."ask_paise" IS NULL OR "supply_requests"."ask_paise">=0))
);
--> statement-breakpoint
CREATE INDEX `requests_collector` ON `supply_requests` (`collector_id`,`id`);--> statement-breakpoint
CREATE INDEX `requests_recycler` ON `supply_requests` (`recycler_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER request_guard BEFORE INSERT ON supply_requests BEGIN
  SELECT RAISE(ABORT,'MARKET_CONFLICT: Requirement or draft changed. Refresh and review before submitting.') WHERE NOT EXISTS (
    SELECT 1 FROM requirements r JOIN facilities f ON f.id=r.facility_id
    JOIN lots l ON l.id=NEW.lot_id JOIN lot_items i ON i.lot_id=l.id AND i.id=NEW.item_id
    JOIN users c ON c.id=NEW.collector_id JOIN users u ON u.id=r.owner_id
    WHERE r.id=NEW.requirement_id AND r.owner_id=NEW.recycler_id AND r.version=NEW.requirement_version
      AND l.owner_user_id=NEW.collector_id AND l.version=NEW.lot_version
      AND c.status='active' AND u.status='active' AND f.verification_status='verified'
      AND r.state='active' AND r.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND i.review_state='confirmed' AND i.broad_code=r.broad_code AND i.unit=r.unit AND NEW.unit=r.unit
      AND (r.detailed_code IS NULL OR i.detailed_code IS NULL OR r.detailed_code=i.detailed_code)
      AND NEW.quantity_base>=r.minimum_base AND i.quantity_base>=NEW.quantity_base
      AND EXISTS(SELECT 1 FROM json_each(r.areas_json) WHERE value=lower(trim(l.locality)))
      AND EXISTS(SELECT 1 FROM json_each(r.modes_json) WHERE value=NEW.mode)
  );
END;
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
      AND f.verification_status='verified' AND c.status='active' AND u.status='active'
      AND NEW.collector_id=s.collector_id AND NEW.recycler_id=s.recycler_id AND NEW.facility_id=r.facility_id
      AND NEW.material_paise=coalesce(s.ask_paise,json_extract(s.snapshot_json,'$.estimatePaise'))
      AND (r.detailed_code IS NULL OR
        r.detailed_code=(SELECT json_extract(message,'$.code') FROM market_events WHERE request_id=s.id AND kind='category.confirmed' ORDER BY CAST(json_extract(message,'$.requestVersion') AS INTEGER) DESC LIMIT 1))
      AND i.quantity_base-coalesce((SELECT sum(quantity_base) FROM reservations WHERE lot_id=s.lot_id AND item_id=s.item_id AND state IN ('held','consumed')),0)>=s.quantity_base
      AND (r.target_base IS NULL OR r.target_base-coalesce((SELECT sum(quantity_base) FROM reservations WHERE requirement_id=r.id AND state IN ('held','consumed')),0)>=s.quantity_base)
  );
END;
--> statement-breakpoint
CREATE TRIGGER order_reserve AFTER INSERT ON orders BEGIN
  INSERT INTO reservations(order_id,requirement_id,lot_id,item_id,quantity_base,state)
    SELECT NEW.id,requirement_id,lot_id,item_id,quantity_base,'held' FROM supply_requests WHERE id=NEW.request_id;
  UPDATE supply_requests SET state='accepted',version=version+1,updated_at=NEW.created_at WHERE id=NEW.request_id;
  INSERT INTO order_terms(order_id,version,proposed_by,amount_paise,reason,status,acknowledged_by,created_at,acknowledged_at)
    VALUES(NEW.id,1,NEW.collector_id,NEW.material_paise,'Submitted material proposal accepted by recycler','acknowledged',NEW.recycler_id,NEW.created_at,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER order_cancel AFTER UPDATE OF state ON orders WHEN OLD.state='accepted' AND NEW.state='cancelled' BEGIN
  UPDATE reservations SET state='released' WHERE order_id=NEW.id AND state='held';
END;
--> statement-breakpoint
CREATE TRIGGER reserved_lot_guard BEFORE UPDATE ON lots WHEN EXISTS(SELECT 1 FROM reservations WHERE lot_id=OLD.id AND state IN ('held','consumed')) BEGIN
  SELECT RAISE(ABORT,'MARKET_CONFLICT: This lot has reserved stock. Cancel the uncollected order or create a separate lot before editing.');
END;
--> statement-breakpoint
CREATE TRIGGER requirement_allocation_guard BEFORE UPDATE ON requirements BEGIN
  SELECT RAISE(ABORT,'MARKET_CONFLICT: Reserved requirements cannot change material identity or unit.') WHERE EXISTS(SELECT 1 FROM reservations WHERE requirement_id=OLD.id AND state IN ('held','consumed'))
    AND (NEW.broad_code<>OLD.broad_code OR NEW.detailed_code IS NOT OLD.detailed_code OR NEW.unit<>OLD.unit);
  SELECT RAISE(ABORT,'MARKET_CONFLICT: Target cannot be below the allocated quantity.') WHERE NEW.target_base IS NOT NULL AND NEW.target_base<coalesce((SELECT sum(quantity_base) FROM reservations WHERE requirement_id=OLD.id AND state IN ('held','consumed')),0);
END;
