CREATE TABLE `outreach_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barber_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`category` text NOT NULL,
	`suggested_at` text NOT NULL,
	`won_at` text,
	`reported_at` text,
	`earnings` integer DEFAULT 25 NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outreach_barber_client_idx` ON `outreach_events` (`barber_id`,`client_id`);
--> statement-breakpoint
CREATE INDEX `outreach_won_idx` ON `outreach_events` (`barber_id`,`won_at`);
