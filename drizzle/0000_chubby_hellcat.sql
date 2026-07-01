CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`starts_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `appointments_barber_starts_at_idx` ON `appointments` (`barber_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `appointments_client_idx` ON `appointments` (`client_id`);--> statement-breakpoint
CREATE TABLE `barbers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` text NOT NULL,
	`name` text,
	`average_time` integer DEFAULT 30 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `barbers_phone_unique` ON `barbers` (`phone`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_barber_phone_idx` ON `clients` (`barber_id`,`phone`);--> statement-breakpoint
CREATE INDEX `clients_barber_name_idx` ON `clients` (`barber_id`,`name`);--> statement-breakpoint
CREATE TABLE `conversation_states` (
	`barber_id` integer PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'idle' NOT NULL,
	`context` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE cascade
);
