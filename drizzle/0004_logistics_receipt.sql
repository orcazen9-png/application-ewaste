CREATE TABLE `logistics_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`opened_by` text NOT NULL,
	`reason` text NOT NULL,
	`state` text NOT NULL,
	`resolution` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "logistics_case_state" CHECK("logistics_cases"."state" IN ('open','resolved'))
);
--> statement-breakpoint
CREATE INDEX `logistics_case_order` ON `logistics_cases` (`order_id`,`state`);--> statement-breakpoint
CREATE TABLE `logistics_commands` (
	`actor` text NOT NULL,
	`command_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`actor`, `command_id`)
);
--> statement-breakpoint
CREATE TABLE `logistics_files` (
	`record_id` text NOT NULL,
	`file_id` text NOT NULL,
	PRIMARY KEY(`record_id`, `file_id`),
	FOREIGN KEY (`record_id`) REFERENCES `logistics_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `logistics_jobs` (
	`order_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`partner_id` text,
	`schedule_json` text,
	`cost_json` text,
	`pickup_json` text,
	`receipt_json` text,
	`return_json` text,
	`cost_version` integer DEFAULT 0 NOT NULL,
	`cost_ack_version` integer DEFAULT 0 NOT NULL,
	`accepted_base` integer,
	`returned_base` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `logistics_partners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "logistics_state_valid" CHECK("logistics_jobs"."state" IN ('not_arranged','scheduled','picked_up','in_transit','received','return_pending','returned')),
	CONSTRAINT "logistics_numbers" CHECK("logistics_jobs"."version">0 AND "logistics_jobs"."cost_version">=0 AND "logistics_jobs"."cost_ack_version" BETWEEN 0 AND "logistics_jobs"."cost_version" AND ("logistics_jobs"."accepted_base" IS NULL OR "logistics_jobs"."accepted_base">=0) AND "logistics_jobs"."returned_base">=0)
);
--> statement-breakpoint
CREATE INDEX `logistics_state` ON `logistics_jobs` (`state`,`order_id`);--> statement-breakpoint
CREATE TABLE `logistics_partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`areas_json` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "partner_status" CHECK("logistics_partners"."status" IN ('active','unavailable')),
	CONSTRAINT "partner_version" CHECK("logistics_partners"."version">0)
);
--> statement-breakpoint
CREATE TABLE `logistics_records` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `logistics_record_order` ON `logistics_records` (`order_id`,`version`);--> statement-breakpoint
CREATE TABLE `operations_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "staff_role" CHECK("operations_staff"."role" IN ('operations','viewer')),
	CONSTRAINT "staff_status" CHECK("operations_staff"."status" IN ('active','suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_staff_subject_unique` ON `operations_staff` (`subject`);--> statement-breakpoint
ALTER TABLE `reservations` ADD `demand_base` integer;
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
      AND f.verification_status='verified' AND c.status='active' AND u.status='active'
      AND NEW.collector_id=s.collector_id AND NEW.recycler_id=s.recycler_id AND NEW.facility_id=r.facility_id
      AND NEW.material_paise=coalesce(s.ask_paise,json_extract(s.snapshot_json,'$.estimatePaise'))
      AND (r.detailed_code IS NULL OR
        r.detailed_code=(SELECT json_extract(message,'$.code') FROM market_events WHERE request_id=s.id AND kind='category.confirmed' ORDER BY CAST(json_extract(message,'$.requestVersion') AS INTEGER) DESC LIMIT 1))
      AND i.quantity_base-coalesce((SELECT sum(quantity_base) FROM reservations WHERE lot_id=s.lot_id AND item_id=s.item_id AND state IN ('held','consumed')),0)>=s.quantity_base
      AND (r.target_base IS NULL OR r.target_base-coalesce((SELECT sum(coalesce(demand_base,quantity_base)) FROM reservations WHERE requirement_id=r.id AND state IN ('held','consumed')),0)>=s.quantity_base)
  );
END;
--> statement-breakpoint
DROP TRIGGER requirement_allocation_guard;
--> statement-breakpoint
CREATE TRIGGER requirement_allocation_guard BEFORE UPDATE ON requirements BEGIN
  SELECT RAISE(ABORT,'MARKET_CONFLICT: Reserved requirements cannot change material identity or unit.') WHERE EXISTS(SELECT 1 FROM reservations WHERE requirement_id=OLD.id AND state IN ('held','consumed'))
    AND (NEW.broad_code<>OLD.broad_code OR NEW.detailed_code IS NOT OLD.detailed_code OR NEW.unit<>OLD.unit);
  SELECT RAISE(ABORT,'MARKET_CONFLICT: Target cannot be below the allocated quantity.') WHERE NEW.target_base IS NOT NULL AND NEW.target_base<coalesce((SELECT sum(coalesce(demand_base,quantity_base)) FROM reservations WHERE requirement_id=OLD.id AND state IN ('held','consumed')),0);
END;
--> statement-breakpoint
CREATE TRIGGER custody_cancel_guard BEFORE UPDATE OF state ON orders WHEN NEW.state='cancelled' AND EXISTS(SELECT 1 FROM logistics_jobs WHERE order_id=OLD.id AND pickup_json IS NOT NULL) BEGIN
 SELECT RAISE(ABORT,'MARKET_CONFLICT: Goods have left the collector. Arrange a return and confirm physical custody instead of cancelling.');
END;
--> statement-breakpoint
CREATE TRIGGER pickup_partner_guard BEFORE INSERT ON logistics_records WHEN NEW.kind='pickup' BEGIN
 SELECT RAISE(ABORT,'MARKET_CONFLICT: Logistics partner or charge acknowledgment changed.') WHERE NOT EXISTS(SELECT 1 FROM logistics_jobs j JOIN logistics_partners p ON p.id=j.partner_id WHERE j.order_id=NEW.order_id AND p.status='active' AND j.cost_version>0 AND j.cost_ack_version=j.cost_version);
END;
--> statement-breakpoint
CREATE TRIGGER demand_base_guard BEFORE UPDATE OF demand_base ON reservations WHEN NEW.demand_base IS NOT NULL AND (NEW.demand_base<0 OR NEW.demand_base>COALESCE(OLD.demand_base,OLD.quantity_base)) BEGIN
 SELECT RAISE(ABORT,'MARKET_CONFLICT: Demand allocation cannot increase without capacity review.');
END;
