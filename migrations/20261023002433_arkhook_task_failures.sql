CREATE TABLE `arkhook_task_failures` (
	`task_id` text PRIMARY KEY NOT NULL,
	`stage_id` text,
	`battle_rank` integer,
	`recorded_at` integer NOT NULL,
	`record_json` blob NOT NULL,
	CONSTRAINT "arkhook_task_failures_rank_check" CHECK("arkhook_task_failures"."battle_rank" IS NULL OR "arkhook_task_failures"."battle_rank" BETWEEN 0 AND 3),
	CONSTRAINT "arkhook_task_failures_recorded_check" CHECK("arkhook_task_failures"."recorded_at" >= 0),
	CONSTRAINT "arkhook_task_failures_blob_check" CHECK(typeof("arkhook_task_failures"."record_json") = 'blob' AND length("arkhook_task_failures"."record_json") <= 1900000)
);
--> statement-breakpoint
CREATE INDEX `idx_arkhook_task_failures_recorded` ON `arkhook_task_failures` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_arkhook_task_failures_stage_recorded` ON `arkhook_task_failures` (`stage_id`,`recorded_at`);