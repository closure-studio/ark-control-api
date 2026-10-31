import * as v from "valibot";

import {
  GitHubDispatchRequestSchema,
  type GitHubRun
} from "../../src/schemas/apk-delivery/compatibility";

export const GITHUB_API = "https://api.github.com/repos/ArkLikeDev/ArkHook";
export const TEST_COMMIT = "b".repeat(40);

export function compatibilityFetcher(
  upstream: typeof fetch,
  status: () => GitHubRun["status"] = () => "completed",
  conclusion: () => string = () => "success"
): typeof fetch {
  const runs = new Map<number, GitHubRun>();
  return async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (!url.startsWith(GITHUB_API)) return upstream(input, init);
    if (url === `${GITHUB_API}/commits/greenfield`) return Response.json({ sha: TEST_COMMIT });
    if (url.endsWith("/dispatches") && init?.method === "POST") {
      const request = v.parse(
        v.pipe(v.string(), v.parseJson(), GitHubDispatchRequestSchema),
        init.body
      );
      const id = 1000 + runs.size;
      const html = `https://github.com/ArkLikeDev/ArkHook/actions/runs/${id}`;
      runs.set(id, {
        id,
        run_attempt: 1,
        display_title: `compatibility ${request.inputs.job_id}`,
        path: ".github/workflows/compatibility.yml",
        event: "workflow_dispatch",
        head_branch: request.ref,
        html_url: html,
        status: "queued",
        conclusion: null
      });
      return Response.json({
        workflow_run_id: id,
        run_url: `${GITHUB_API}/actions/runs/${id}`,
        html_url: html
      });
    }
    const current = [...runs.values()].map((run) => ({
      ...run,
      status: status(),
      conclusion: status() === "completed" ? conclusion() : null
    }));
    if (url.includes("/workflows/compatibility.yml/runs?"))
      return Response.json({ workflow_runs: current });
    const run = current.find((candidate) => url === `${GITHUB_API}/actions/runs/${candidate.id}`);
    return run ? Response.json(run) : new Response(null, { status: 404 });
  };
}
