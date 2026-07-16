CREATE TABLE `control_job_locks` (
	`job_name` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gcp_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`project_id` text NOT NULL,
	`service_account_email` text NOT NULL,
	`workload_identity_provider` text NOT NULL,
	`default_zone` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "gcp_accounts_enabled_check" CHECK("gcp_accounts"."enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gcp_accounts_project_id_unique` ON `gcp_accounts` (`project_id`);--> statement-breakpoint
CREATE TABLE `gcp_instance_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` text NOT NULL,
	`account_id` integer,
	`account_name_snapshot` text,
	`project_id` text NOT NULL,
	`zone` text NOT NULL,
	`instance_name` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`google_operation_name` text,
	`message` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `gcp_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "gcp_instance_operations_action_check" CHECK("gcp_instance_operations"."action" IN ('create', 'start', 'stop', 'delete')),
	CONSTRAINT "gcp_instance_operations_status_check" CHECK("gcp_instance_operations"."status" IN ('skipped', 'submitted', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_gcp_instance_operations_account_created` ON `gcp_instance_operations` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_gcp_instance_operations_created` ON `gcp_instance_operations` (`created_at`);--> statement-breakpoint
CREATE TABLE `vps_hosts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`password_ciphertext` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "vps_hosts_port_check" CHECK("vps_hosts"."port" BETWEEN 1 AND 65535),
	CONSTRAINT "vps_hosts_enabled_check" CHECK("vps_hosts"."enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vps_hosts_name_unique` ON `vps_hosts` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `vps_hosts_address_port_username_unique` ON `vps_hosts` (`address`,`port`,`username`);--> statement-breakpoint
CREATE TABLE `watcher_deployments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`release_id` integer NOT NULL,
	`host_id` integer,
	`host_name_snapshot` text NOT NULL,
	`host_address_snapshot` text NOT NULL,
	`status` text NOT NULL,
	`failure_stage` text,
	`started_at` text,
	`next_check_at` text,
	`deadline_at` text,
	`last_checked_at` text,
	`finished_at` text,
	`last_log_tail` text,
	`last_ai_status` text,
	`last_ai_reason` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `watcher_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `vps_hosts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "watcher_deployments_status_check" CHECK("watcher_deployments"."status" IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')),
	CONSTRAINT "watcher_deployments_failure_stage_check" CHECK("watcher_deployments"."failure_stage" IS NULL OR "watcher_deployments"."failure_stage" IN ('start', 'ssh', 'ai', 'deadline')),
	CONSTRAINT "watcher_deployments_last_ai_status_check" CHECK("watcher_deployments"."last_ai_status" IS NULL OR "watcher_deployments"."last_ai_status" IN ('success', 'running', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE INDEX `idx_watcher_deployments_status_next_check` ON `watcher_deployments` (`status`,`next_check_at`);--> statement-breakpoint
CREATE INDEX `idx_watcher_deployments_status_created` ON `watcher_deployments` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `watcher_deployments_release_id_host_id_unique` ON `watcher_deployments` (`release_id`,`host_id`);--> statement-breakpoint
CREATE TABLE `watcher_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`apk_filename` text NOT NULL,
	`final_url` text NOT NULL,
	`detected_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watcher_releases_apk_filename_unique` ON `watcher_releases` (`apk_filename`);--> statement-breakpoint
CREATE INDEX `idx_watcher_releases_detected` ON `watcher_releases` (`detected_at`);