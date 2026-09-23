-- Additive personal-account foundation; legacy workspace records are unchanged.
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_id` text NOT NULL,
	`resource_version` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_resource` ON `audit_events` (`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`requested_role` text NOT NULL,
	`language` text NOT NULL,
	`provider_reference` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_by` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "challenge_role" CHECK("auth_challenges"."requested_role" IN ('collector','recycler')),
	CONSTRAINT "challenge_language" CHECK("auth_challenges"."language" IN ('en','hi','mr')),
	CONSTRAINT "challenge_status" CHECK("auth_challenges"."status" IN ('sending','pending','consumed','failed')),
	CONSTRAINT "challenge_attempts" CHECK("auth_challenges"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE INDEX `auth_challenges_mobile_created` ON `auth_challenges` (`mobile`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`key`, `window`),
	CONSTRAINT "rate_positive" CHECK("auth_rate_limits"."count">0)
);
--> statement-breakpoint
CREATE TABLE `broad_categories` (
	`taxonomy_version` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`taxonomy_version`, `code`),
	FOREIGN KEY (`taxonomy_version`) REFERENCES `taxonomy_versions`(`version`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `command_receipts` (
	`actor_id` text NOT NULL,
	`command_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`actor_id`, `command_id`),
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `equipment_categories` (
	`taxonomy_version` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`default_broad_code` text NOT NULL,
	`review_note` text NOT NULL,
	PRIMARY KEY(`taxonomy_version`, `code`),
	FOREIGN KEY (`taxonomy_version`) REFERENCES `taxonomy_versions`(`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taxonomy_version`,`default_broad_code`) REFERENCES `broad_categories`(`taxonomy_version`,`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `facilities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`locality` text DEFAULT '' NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "facility_verification" CHECK("facilities"."verification_status" IN ('unverified','pending','verified','expired','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facilities_organization_id_unique` ON `facilities` (`organization_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "file_type" CHECK("files"."mime_type" IN ('image/jpeg','image/png')),
	CONSTRAINT "file_size" CHECK("files"."size_bytes" BETWEEN 1 AND 2097152),
	CONSTRAINT "file_width" CHECK("files"."width">0),
	CONSTRAINT "file_height" CHECK("files"."height">0),
	CONSTRAINT "file_state" CHECK("files"."state" IN ('uploading','ready'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_object_key_unique` ON `files` (`object_key`);--> statement-breakpoint
CREATE INDEX `files_owner` ON `files` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `lot_files` (
	`lot_id` text NOT NULL,
	`file_id` text NOT NULL,
	PRIMARY KEY(`lot_id`, `file_id`),
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lot_items` (
	`lot_id` text NOT NULL,
	`id` text NOT NULL,
	`taxonomy_version` text NOT NULL,
	`broad_code` text,
	`detailed_code` text,
	`description` text NOT NULL,
	`condition` text NOT NULL,
	`unit` text NOT NULL,
	`quantity_base` integer,
	`review_state` text NOT NULL,
	PRIMARY KEY(`lot_id`, `id`),
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taxonomy_version`) REFERENCES `taxonomy_versions`(`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taxonomy_version`,`broad_code`) REFERENCES `broad_categories`(`taxonomy_version`,`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taxonomy_version`,`detailed_code`) REFERENCES `equipment_categories`(`taxonomy_version`,`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_condition" CHECK("lot_items"."condition" IN ('unsorted','sorted','damaged','unknown')),
	CONSTRAINT "item_unit" CHECK("lot_items"."unit" IN ('kg','piece')),
	CONSTRAINT "item_quantity" CHECK("lot_items"."quantity_base">0),
	CONSTRAINT "item_review" CHECK("lot_items"."review_state" IN ('needs_review','confirmed'))
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`locality` text NOT NULL,
	`notes` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer NOT NULL,
	`last_command` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lot_status" CHECK("lots"."status"='draft'),
	CONSTRAINT "lot_version" CHECK("lots"."version">0)
);
--> statement-breakpoint
CREATE INDEX `lots_owner_updated` ON `lots` (`owner_user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`user_id`, `organization_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "membership_role" CHECK("memberships"."role"='owner')
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'recycler' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "organization_kind" CHECK("organizations"."kind"='recycler')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_owner_user_id_unique` ON `organizations` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `taxonomy_versions` (
	`version` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`role` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`locality` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_role" CHECK("users"."role" IN ('collector','recycler')),
	CONSTRAINT "users_language" CHECK("users"."language" IN ('en','hi','mr')),
	CONSTRAINT "users_status" CHECK("users"."status" IN ('active','suspended')),
	CONSTRAINT "users_version" CHECK("users"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_mobile_unique` ON `users` (`mobile`);
-- Existing catalogue labels copied without AI regeneration.
INSERT INTO taxonomy_versions (version,source_url,status) VALUES ('106-draft-v1','https://eprewaste.cpcb.gov.in/assets/PDF/Framework.pdf','proposed product mapping; not a trained model or regulatory determination');
INSERT INTO broad_categories (taxonomy_version,code,name) VALUES
('106-draft-v1','B01','Computers and laptops'),
('106-draft-v1','B02','Mobile phones and tablets'),
('106-draft-v1','B03','Printers and office machines'),
('106-draft-v1','B04','Telephones and networking equipment'),
('106-draft-v1','B05','UPS and inverters'),
('106-draft-v1','B06','Data storage devices'),
('106-draft-v1','B07','TVs, monitors and displays'),
('106-draft-v1','B08','Audio, video and cameras'),
('106-draft-v1','B09','Fridges, freezers and air conditioners'),
('106-draft-v1','B10','Washing, drying and cleaning machines'),
('106-draft-v1','B11','Kitchen and food appliances'),
('106-draft-v1','B12','Fans, heaters and air purifiers'),
('106-draft-v1','B13','Clothing-care and personal-care appliances'),
('106-draft-v1','B14','Lamps and lighting equipment'),
('106-draft-v1','B15','Solar panels and cells'),
('106-draft-v1','B16','Power tools and workshop equipment'),
('106-draft-v1','B17','Toys, games and sports electronics'),
('106-draft-v1','B18','Vending and dispensing machines'),
('106-draft-v1','B19','Sensors, controls and laboratory instruments'),
('106-draft-v1','B20','Medical equipment');
INSERT INTO equipment_categories (taxonomy_version,code,name,default_broad_code,review_note) VALUES
('106-draft-v1','ITEW1','Centralized data processing: Mainframes, Minicomputers','B01','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW2','Personal Computers (Central Processing Unit with input and output devices)','B01','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW3','Laptop Computers (Central Processing Unit with input and output devices)','B01','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW4','Notebook Computers','B01','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW5','Notepad Computers','B02','Provisional default only: pen/slate devices map here; keyboard-based notepad computers may map to B01. Confirm form and intended function.'),
('106-draft-v1','ITEW6','Printers including cartridges','B03','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW7','Copying Equipment','B03','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW8','Electrical and Electronic Typewriters','B03','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW9','User Terminal and Systems','B01','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW10','Facsimile','B03','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW11','Telex','B03','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW12','Telephones','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW13','Pay Telephones','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW14','Cordless Telephones','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW15','Cellular Telephones','B02','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW16','Answering System','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW17','Telecommunications transmission equipment','B04','Broad telecom definition overlaps audio/video; verify intended function.'),
('106-draft-v1','ITEW18','BTS components excluding tower','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW19','Tablets, iPad','B02','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW20','Phablets','B02','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW21','Scanners','B03','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW22','Routers','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW23','GPS','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW24','UPS','B05','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW25','Inverter','B05','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW26','Modems','B04','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','ITEW27','Electronic Data Storage Devices','B06','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW1','Television sets, including LCD and LED televisions','B07','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW2','Refrigerator','B09','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW3','Washing Machine','B10','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW4','Air Conditioners, excluding centralized air-conditioning plants','B09','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW5','Fluorescent and other mercury-containing lamps','B14','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW6','Screen, Electronic Photo Frames, Electronic Display Panel, Monitors','B07','Electronic displays overlap LSEEW34; retain unresolved alternatives until confirmed.'),
('106-draft-v1','CEEW7','Radio Sets','B08','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW8','Set Top Boxes','B08','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW9','Video Cameras','B08','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW10','Video Recorders','B08','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW11','Hi-Fi Recorders','B08','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW12','Audio Amplifiers','B08','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW13','Other equipment for recording/reproducing sound or images and distribution through telecommunications','B08','Broad audio/video definition overlaps telecommunications; verify intended function.'),
('106-draft-v1','CEEW14','Solar Panels/Cells, Solar Photovoltaic Panels/Cells/Modules','B15','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW15','Luminaires for fluorescent lamps except household luminaires','B14','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW16','High-intensity discharge lamps, including pressure sodium and metal-halide lamps','B14','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW17','Low-pressure sodium lamps','B14','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW18','Other lighting/equipment for spreading or controlling light, excluding filament bulbs','B14','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','CEEW19','Digital Camera','B08','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW1','Large cooling appliances','B09','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW2','Freezers','B09','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW3','Other large food refrigeration and storage appliances','B09','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW4','Clothes dryers','B10','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW5','Dishwashing machines','B10','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW6','Electric cookers','B11','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW7','Electric stoves','B11','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW8','Electric hot plates','B11','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW9','Microwaves and microwave ovens','B11','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW10','Other large cooking and food-processing appliances','B11','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW11','Electric heating appliances','B12','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW12','Electric radiators','B12','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW13','Other large room, bed and seating heating appliances','B12','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW14','Electric fans','B12','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW15','Other fanning, exhaust ventilation and conditioning equipment','B12','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW16','Vacuum cleaners','B10','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW17','Carpet sweepers','B10','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW18','Other cleaning appliances','B10','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW19','Sewing, knitting, weaving and textile-processing appliances','B13','Sewing equipment overlaps EETW3; confirm detailed code from specifications/context.'),
('106-draft-v1','LSEEW20','Irons and other clothing-care appliances','B13','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW21','Grinders, coffee machines and container opening or sealing equipment','B11','Packaging equipment may route to B16 instead of B11; check primary function.'),
('106-draft-v1','LSEEW22','Smoke detectors','B19','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW23','Heating regulators','B19','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW24','Thermostats','B19','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW25','Automatic hot-drink dispensers','B18','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW26','Automatic hot/cold bottle or can dispensers','B18','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW27','Automatic solid-product dispensers','B18','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW28','Automatic money dispensers','B18','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW29','Other automatic product dispensers','B18','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW30','Indoor air purifiers','B12','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW31','Hair dryers','B13','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW32','Electric shavers','B13','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW33','Electric kettles','B11','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LSEEW34','Electronic displays','B07','Electronic displays overlap CEEW6; appearance cannot decide the detailed code.'),
('106-draft-v1','EETW1','Drills','B16','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','EETW2','Saws','B16','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','EETW3','Sewing machines','B13','Sewing equipment overlaps LSEEW19; confirm detailed code from specifications/context.'),
('106-draft-v1','EETW4','Equipment for machining and processing wood, metal and other materials','B16','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','EETW5','Riveting, nailing, screwing and related tools','B16','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','EETW6','Welding, soldering and related tools','B16','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','EETW7','Spraying, spreading, dispersing and related liquid/gas treatment equipment','B16','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','EETW8','Mowing and gardening tools','B16','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','TLSEW1','Electric train and car racing sets','B17','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','TLSEW2','Handheld video-game consoles','B17','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','TLSEW3','Video games','B17','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','TLSEW4','Computers for biking, diving, running, rowing and similar activities','B17','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','TLSEW5','Sports equipment with electrical/electronic components','B17','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','TLSEW6','Coin-slot machines','B17','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW1','Radiotherapy equipment and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW2','Cardiology equipment and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW3','Dialysis equipment and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW4','Pulmonary ventilators and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW5','Nuclear medicine equipment and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW6','In-vitro diagnostic laboratory equipment and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW7','Analysers and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW8','MRI, PET, CT and ultrasound equipment and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW9','Fertilization test equipment and accessories','B20','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','MDW10','Other electrical medical prevention, screening, diagnosis, monitoring and treatment equipment and accessories, including devices with potential sex-selection features','B20','Intended medical use requires documentation; ordinary phones/tablets must not automatically receive this code.'),
('106-draft-v1','LIW1','Gas analysers','B19','Detailed code requires user/buyer confirmation; image-only assessment may be insufficient.'),
('106-draft-v1','LIW2','Equipment having electrical and electronic components (laboratory instruments group)','B19','Very broad wording within laboratory instruments; do not use as a catch-all for all electronics.');
