CREATE TABLE `public_announcement_collection` (
	`source_id` text PRIMARY KEY NOT NULL,
	`last_attempt_at` text NOT NULL,
	`last_success_at` text,
	`status` text NOT NULL,
	`error_code` text,
	`retry_at` text
);
--> statement-breakpoint
CREATE TABLE `public_announcements` (
	`news_id` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`published_at` text,
	`content_hash` text NOT NULL,
	`windows_json` text NOT NULL,
	`fetched_at` text NOT NULL,
	`recheck_at` text NOT NULL
);
