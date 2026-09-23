DROP INDEX `invoices_order`;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_order` ON `invoices` (`order_id`,`account`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_reference` ON `payments` (`order_id`,`account`,`reference`);
--> statement-breakpoint
CREATE TRIGGER notify_market_event AFTER INSERT ON market_events BEGIN
 INSERT INTO notifications(id,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(6))),u.id,'market.'||NEW.kind,NEW.request_id,'Request update','Open your request to review the latest update.',NEW.created_at
 FROM supply_requests s JOIN users u ON u.id IN (s.collector_id,s.recycler_id) WHERE s.id=NEW.request_id;
END;
--> statement-breakpoint
CREATE TRIGGER notify_logistics_event AFTER INSERT ON logistics_records WHEN NEW.kind<>'internal-note' BEGIN
 INSERT INTO notifications(id,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(6))),u.id,'logistics.'||NEW.kind,NEW.order_id,'Pickup and receipt update','Open your order to review the latest update.',NEW.created_at
 FROM orders o JOIN users u ON u.id IN (o.collector_id,o.recycler_id) WHERE o.id=NEW.order_id;
END;
