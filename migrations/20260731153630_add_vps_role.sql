PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vps_hosts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`password_ciphertext` text NOT NULL,
	`role` text DEFAULT 'redroid' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "vps_hosts_port_check" CHECK("__new_vps_hosts"."port" BETWEEN 1 AND 65535),
	CONSTRAINT "vps_hosts_role_check" CHECK("__new_vps_hosts"."role" IN ('redroid', 'arkhost')),
	CONSTRAINT "vps_hosts_enabled_check" CHECK("__new_vps_hosts"."enabled" IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_vps_hosts`("id", "name", "address", "port", "username", "password_ciphertext", "role", "enabled", "created_at", "updated_at") SELECT "id", "name", "address", "port", "username", "password_ciphertext", 'redroid', "enabled", "created_at", "updated_at" FROM `vps_hosts`;--> statement-breakpoint
DROP TABLE `vps_hosts`;--> statement-breakpoint
ALTER TABLE `__new_vps_hosts` RENAME TO `vps_hosts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `vps_hosts_name_unique` ON `vps_hosts` (`name`);--> statement-breakpoint
CREATE INDEX `idx_vps_hosts_arkhost` ON `vps_hosts` (`id`) WHERE "vps_hosts"."role" = 'arkhost';--> statement-breakpoint
CREATE UNIQUE INDEX `vps_hosts_address_port_username_unique` ON `vps_hosts` (`address`,`port`,`username`);
