CREATE TABLE `arknights_apk_deployments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`release_id` integer NOT NULL,
	`host_id` integer,
	`host_name_snapshot` text NOT NULL,
	`host_address_snapshot` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`next_check_at` text,
	`deadline_at` text,
	`last_checked_at` text,
	`last_log_tail` text,
	`last_ai_status` text,
	`last_ai_reason` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `arknights_apk_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `vps_hosts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "arknights_apk_deployments_status_check" CHECK("arknights_apk_deployments"."status" IN ('pending', 'running', 'succeeded', 'failed', 'timed_out')),
	CONSTRAINT "arknights_apk_deployments_last_ai_status_check" CHECK("arknights_apk_deployments"."last_ai_status" IS NULL OR "arknights_apk_deployments"."last_ai_status" IN ('success', 'running', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE INDEX `idx_arknights_apk_deployments_status_next_check` ON `arknights_apk_deployments` (`status`,`next_check_at`);--> statement-breakpoint
CREATE INDEX `idx_arknights_apk_deployments_status_created` ON `arknights_apk_deployments` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `arknights_apk_deployments_release_id_host_id_unique` ON `arknights_apk_deployments` (`release_id`,`host_id`);--> statement-breakpoint
CREATE TABLE `arknights_apk_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`apk_filename` text NOT NULL,
	`final_url` text NOT NULL,
	`detected_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arknights_apk_releases_apk_filename_unique` ON `arknights_apk_releases` (`apk_filename`);--> statement-breakpoint
CREATE INDEX `idx_arknights_apk_releases_detected` ON `arknights_apk_releases` (`detected_at`);--> statement-breakpoint
CREATE TABLE `arknights_maintenance_announcements` (
	`news_id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`processing_state` text NOT NULL,
	`claim_expires_at` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`processed_at` text,
	`title` text,
	`is_maintenance` integer,
	`maintenance_start` text,
	`maintenance_end` text,
	`notified` integer DEFAULT false NOT NULL,
	`error_message` text,
	CONSTRAINT "arknights_maintenance_announcements_state_check" CHECK("arknights_maintenance_announcements"."processing_state" IN ('processing', 'completed', 'failed')),
	CONSTRAINT "arknights_maintenance_announcements_notified_check" CHECK("arknights_maintenance_announcements"."notified" IN (0, 1))
);
--> statement-breakpoint
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
CREATE TABLE `gcp_operation_logs` (
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
	CONSTRAINT "gcp_operation_logs_action_check" CHECK("gcp_operation_logs"."action" IN ('create', 'start', 'stop', 'delete')),
	CONSTRAINT "gcp_operation_logs_status_check" CHECK("gcp_operation_logs"."status" IN ('skipped', 'submitted', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_gcp_operation_logs_account_created` ON `gcp_operation_logs` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_gcp_operation_logs_created` ON `gcp_operation_logs` (`created_at`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `vps_hosts_address_port_username_unique` ON `vps_hosts` (`address`,`port`,`username`);