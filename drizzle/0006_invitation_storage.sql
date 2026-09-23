CREATE TABLE `invitations` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`expires_at` text NOT NULL,
	`redeemed_by` text,
	`revoked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invitations_actor` ON `invitations` (`actor`);--> statement-breakpoint
CREATE TABLE `private_chunks` (
	`key` text NOT NULL,
	`part` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`key`, `part`),
	FOREIGN KEY (`key`) REFERENCES `private_objects`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `private_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "private_object_size" CHECK("private_objects"."size" BETWEEN 1 AND 5242880)
);
--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staff_sessions_actor` ON `staff_sessions` (`staff_id`);