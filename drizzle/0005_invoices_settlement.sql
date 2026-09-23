CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_actor` text NOT NULL,
	`order_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "document_state" CHECK("documents"."state" IN ('uploading','ready')),
	CONSTRAINT "document_size" CHECK("documents"."size" BETWEEN 1 AND 5242880)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_object_key_unique` ON `documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `documents_order` ON `documents` (`order_id`,`id`);--> statement-breakpoint
CREATE INDEX `documents_owner` ON `documents` (`owner_actor`,`id`);--> statement-breakpoint
CREATE TABLE `finance_events` (
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
CREATE INDEX `finance_events_order` ON `finance_events` (`order_id`,`version`);--> statement-breakpoint
CREATE TABLE `invoice_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`version` integer NOT NULL,
	`user_id` text NOT NULL,
	`decision` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoice_review_decision" CHECK("invoice_reviews"."decision" IN ('accept','dispute'))
);
--> statement-breakpoint
CREATE INDEX `invoice_reviews_version` ON `invoice_reviews` (`invoice_id`,`version`,`user_id`);--> statement-breakpoint
CREATE TABLE `invoice_versions` (
	`invoice_id` text NOT NULL,
	`version` integer NOT NULL,
	`document_id` text NOT NULL,
	`issuer` text NOT NULL,
	`number` text NOT NULL,
	`issued_on` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`basis_version` integer NOT NULL,
	`quantity_base` integer,
	`unit` text,
	`payee` text NOT NULL,
	`payer` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`invoice_id`, `version`),
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoice_amount" CHECK("invoice_versions"."amount_paise">0),
	CONSTRAINT "invoice_version_status" CHECK("invoice_versions"."status" IN ('submitted','acknowledged','disputed','superseded'))
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`account` text NOT NULL,
	`current_version` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoice_account" CHECK("invoices"."account" IN ('material','logistics'))
);
--> statement-breakpoint
CREATE INDEX `invoices_order` ON `invoices` (`order_id`,`account`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user` ON `notifications` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `payment_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`actor` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_reviews_payment` ON `payment_reviews` (`payment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`invoice_version` integer NOT NULL,
	`account` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`payer` text NOT NULL,
	`payee` text NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`paid_on` text NOT NULL,
	`proof_id` text,
	`evidence_reason` text NOT NULL,
	`recorded_by` text NOT NULL,
	`status` text NOT NULL,
	`exception_reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proof_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_amount" CHECK("payments"."amount_paise">0),
	CONSTRAINT "payment_account" CHECK("payments"."account" IN ('material','logistics')),
	CONSTRAINT "payment_status" CHECK("payments"."status" IN ('pending','confirmed','disputed','reversed'))
);
--> statement-breakpoint
CREATE INDEX `payments_order` ON `payments` (`order_id`,`account`,`id`);--> statement-breakpoint
CREATE INDEX `payments_invoice` ON `payments` (`invoice_id`,`id`);--> statement-breakpoint

CREATE TABLE `__new_operations_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "staff_role" CHECK("__new_operations_staff"."role" IN ('operations','finance','operations_finance','viewer')),
	CONSTRAINT "staff_status" CHECK("__new_operations_staff"."status" IN ('active','suspended'))
);
--> statement-breakpoint
INSERT INTO `__new_operations_staff`("id", "subject", "email", "name", "role", "status", "created_at") SELECT "id", "subject", "email", "name", "role", "status", "created_at" FROM `operations_staff`;--> statement-breakpoint
DROP TABLE `operations_staff`;--> statement-breakpoint
ALTER TABLE `__new_operations_staff` RENAME TO `operations_staff`;--> statement-breakpoint

CREATE UNIQUE INDEX `operations_staff_subject_unique` ON `operations_staff` (`subject`);