ALTER TABLE lot_listings ADD COLUMN asking_rates_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(asking_rates_json));
