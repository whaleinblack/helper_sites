CREATE TABLE `weather_cache` (
	`range_id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`source_version` text NOT NULL
);
