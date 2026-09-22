import { Hono } from "hono";
import type { Env } from "../../schemas/env";
import { getPublicAnnouncements } from "../../controller/public-announcements";

export function createPublicAnnouncementsRouter() {
  const app = new Hono<{ Bindings: Env }>();
  app.get("/announcements", async (c) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Cache-Control", "public, max-age=60");
    return c.json(await getPublicAnnouncements(c.env.DB));
  });
  return app;
}
