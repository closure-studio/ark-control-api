CREATE TABLE `public_announcement_snapshot` (
	`source_id` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
	`collected_at` text NOT NULL,
	`events_json` text NOT NULL
);
--> statement-breakpoint
-- Preserve existing public records before the next migration removes the old tables.
-- Interrupted/partial network collections cannot be certified as a fresh snapshot.
INSERT INTO public_announcement_snapshot (source_id, source_url, collected_at, events_json)
SELECT 'official-cn', 'https://ak.hypergryph.com/news',
  CASE WHEN c.last_success_at IS NOT NULL AND (c.status = 'ready' OR c.error_code = 'parse_pending')
    THEN c.last_success_at ELSE '1970-01-01T00:00:00.000Z' END,
  (SELECT COALESCE(json_group_array(json_object(
    'newsId', news_id, 'sourceUrl', source_url, 'title', title,
    'publishedAt', published_at, 'fetchedAt', fetched_at, 'windows', json(windows_json)
  )), '[]') FROM public_announcements)
FROM (SELECT 1) AS singleton
LEFT JOIN public_announcement_collection AS c ON c.source_id = 'official-cn'
WHERE c.last_success_at IS NOT NULL OR EXISTS (SELECT 1 FROM public_announcements);
