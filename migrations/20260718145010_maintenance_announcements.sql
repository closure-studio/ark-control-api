CREATE TABLE `maintenance_announcements` (
	`news_id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`processing_state` text NOT NULL,
	`claimed_at` text NOT NULL,
	`claim_expires_at` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`processed_at` text,
	`title` text DEFAULT '' NOT NULL,
	`is_maintenance` integer,
	`maintenance_start` text,
	`maintenance_end` text,
	`notified` integer DEFAULT false NOT NULL,
	`notify_channel` text,
	`reason` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`notify_error` text,
	CONSTRAINT "maintenance_announcements_state_check" CHECK("maintenance_announcements"."processing_state" IN ('processing', 'completed', 'failed')),
	CONSTRAINT "maintenance_announcements_notified_check" CHECK("maintenance_announcements"."notified" IN (0, 1)),
	CONSTRAINT "maintenance_announcements_channel_check" CHECK("maintenance_announcements"."notify_channel" IS NULL OR "maintenance_announcements"."notify_channel" = 'qqbot')
);
--> statement-breakpoint
CREATE INDEX `idx_maintenance_announcements_state_claim` ON `maintenance_announcements` (`processing_state`,`claim_expires_at`);