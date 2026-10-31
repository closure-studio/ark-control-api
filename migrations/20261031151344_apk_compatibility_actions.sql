CREATE TABLE `arknights_apk_compatibility_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`apk_filename` text NOT NULL,
	`final_url` text NOT NULL,
	`hook_commit` text NOT NULL,
	`github_run_id` text,
	`github_run_attempt` integer,
	`github_url` text,
	`dispatch_attempted_at` text,
	`status` text NOT NULL,
	`report_json` text,
	`error_message` text,
	`next_check_at` text,
	`deadline_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "apk_compatibility_status_check" CHECK("arknights_apk_compatibility_runs"."status" IN ('queued', 'running', 'passed', 'failed', 'cancelled', 'timed_out'))
);
--> statement-breakpoint
CREATE INDEX `idx_apk_compatibility_next_check` ON `arknights_apk_compatibility_runs` (`status`,`next_check_at`);