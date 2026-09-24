CREATE TABLE lot_deletions(lot_id TEXT PRIMARY KEY NOT NULL REFERENCES lots(id),deleted_at TEXT NOT NULL,deleted_by TEXT NOT NULL REFERENCES users(id));
--> statement-breakpoint
CREATE TRIGGER deleted_lot_edit_guard BEFORE UPDATE ON lots WHEN EXISTS(SELECT 1 FROM lot_deletions WHERE lot_id=OLD.id) BEGIN SELECT RAISE(ABORT,'MARKET_CONFLICT: This lot was deleted.'); END;
--> statement-breakpoint
CREATE TRIGGER deleted_lot_request_guard BEFORE INSERT ON supply_requests WHEN EXISTS(SELECT 1 FROM lot_deletions WHERE lot_id=NEW.lot_id) BEGIN SELECT RAISE(ABORT,'MARKET_CONFLICT: This lot was deleted.'); END;
--> statement-breakpoint
CREATE TRIGGER deleted_lot_order_guard BEFORE INSERT ON orders WHEN EXISTS(SELECT 1 FROM supply_requests s JOIN lot_deletions d ON d.lot_id=s.lot_id WHERE s.id=NEW.request_id) BEGIN SELECT RAISE(ABORT,'MARKET_CONFLICT: This lot was deleted.'); END;
--> statement-breakpoint
CREATE TRIGGER delete_reserved_lot_guard BEFORE INSERT ON lot_deletions WHEN EXISTS(SELECT 1 FROM reservations WHERE lot_id=NEW.lot_id AND state='held') BEGIN SELECT RAISE(ABORT,'MARKET_CONFLICT: Resolve the active order before deleting this lot.'); END;
--> statement-breakpoint
CREATE TABLE conversations(id TEXT PRIMARY KEY NOT NULL,lot_id TEXT NOT NULL REFERENCES lots(id),collector_id TEXT NOT NULL REFERENCES users(id),recycler_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(lot_id,recycler_id));
--> statement-breakpoint
CREATE INDEX conversations_collector ON conversations(collector_id,updated_at);
--> statement-breakpoint
CREATE INDEX conversations_recycler ON conversations(recycler_id,updated_at);
--> statement-breakpoint
CREATE TABLE chat_messages(id TEXT PRIMARY KEY NOT NULL,conversation_id TEXT NOT NULL REFERENCES conversations(id),sender_id TEXT NOT NULL REFERENCES users(id),message TEXT NOT NULL,created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX chat_messages_conversation ON chat_messages(conversation_id,created_at,id);
