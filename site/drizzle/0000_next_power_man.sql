CREATE TABLE `data_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicle_paths` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`trim` text,
	`engine` text,
	`make_normalized` text NOT NULL,
	`model_normalized` text NOT NULL,
	`trim_normalized` text,
	`engine_normalized` text,
	`path_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_paths_path_key_uq` ON `vehicle_paths` (`path_key`);--> statement-breakpoint
CREATE INDEX `vehicle_paths_year_idx` ON `vehicle_paths` (`year`);--> statement-breakpoint
CREATE INDEX `vehicle_paths_year_make_idx` ON `vehicle_paths` (`year`,`make`);--> statement-breakpoint
CREATE INDEX `vehicle_paths_year_make_model_idx` ON `vehicle_paths` (`year`,`make`,`model`);--> statement-breakpoint
CREATE INDEX `vehicle_paths_full_lookup_idx` ON `vehicle_paths` (`year`,`make`,`model`,`trim`);--> statement-breakpoint
CREATE INDEX `vehicle_paths_normalized_idx` ON `vehicle_paths` (`year`,`make_normalized`,`model_normalized`);