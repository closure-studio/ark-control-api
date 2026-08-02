import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  const workers = {
    remoteBindings: false,
    wrangler: { configPath: "./wrangler.toml" },
    miniflare: {
      bindings: { TEST_D1_MIGRATIONS: migrations },
      workers: [
        {
          name: "ark-ssh",
          modules: true,
          script: `
            import { WorkerEntrypoint } from "cloudflare:workers";
            export class ArkSshRpc extends WorkerEntrypoint {
              executeCommand() { return { success: true }; }
            }
          `
        }
      ]
    }
  };
  return {
    plugins: [cloudflareTest(workers)],
    test: {
      include: ["tests/worker/**/*.test.ts"]
    }
  };
});
