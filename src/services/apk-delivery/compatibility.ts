import * as v from "valibot";

import type { ArknightsApkCompatibilityRunRow } from "../../db/schema";
import {
  attachCompatibilityRun,
  claimCompatibilityDispatch,
  createCompatibilityRun,
  dueCompatibilityRuns,
  getCompatibilityRun,
  recordCompatibilityError,
  saveCompatibilityRun
} from "../../repositories/apk-delivery/compatibility";
import {
  GitHubCommitSchema,
  GitHubDispatchSchema,
  GitHubRunListSchema,
  GitHubRunSchema,
  type CompatibilityStatus,
  type GitHubRun
} from "../../schemas/apk-delivery/compatibility";
import type { Env } from "../../schemas/env";
import { notifyCompatibility } from "./notification";

type CompatibilityRuntime = { fetcher?: typeof fetch; logger?: Pick<Console, "error"> };
const REPOSITORY = "ArkLikeDev/ArkHook";
const WORKFLOW = "compatibility.yml";
const API = `https://api.github.com/repos/${REPOSITORY}`;

async function github<T extends v.GenericSchema>(
  env: Env,
  runtime: CompatibilityRuntime,
  path: string,
  schema: T,
  body?: object
): Promise<v.InferOutput<T>> {
  if (!env.COMPATIBILITY_GITHUB_TOKEN) throw new Error("GitHub compatibility credentials missing");
  const response = await (runtime.fetcher ?? fetch)(API + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${env.COMPATIBILITY_GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "ark-control-api",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error(`GitHub compatibility API returned HTTP ${response.status}`);
  return v.parse(schema, await response.json());
}

function ref(env: Env): string {
  return env.COMPATIBILITY_GITHUB_REF ?? "greenfield";
}

async function notifyChange(
  env: Env,
  runtime: CompatibilityRuntime,
  row: ArknightsApkCompatibilityRunRow,
  status: CompatibilityStatus,
  reason: string
): Promise<void> {
  await notifyCompatibility(
    env,
    {
      type: "compatibility",
      apkFilename: row.apk_filename,
      jobId: row.id,
      status,
      reason: row.github_url ? `${reason}\n${row.github_url}` : reason
    },
    runtime
  ).catch(() =>
    (runtime.logger ?? console).error("Compatibility notification failed", { jobId: row.id })
  );
}

function validateRun(env: Env, row: ArknightsApkCompatibilityRunRow, run: GitHubRun): void {
  if (
    run.display_title !== `compatibility ${row.id}` ||
    run.head_branch !== ref(env) ||
    run.path !== `.github/workflows/${WORKFLOW}` ||
    run.html_url !== `https://github.com/${REPOSITORY}/actions/runs/${run.id}` ||
    (row.github_run_id !== null && String(run.id) !== row.github_run_id)
  )
    throw new Error("GitHub workflow identity mismatch");
}

async function pollRun(
  env: Env,
  runtime: CompatibilityRuntime,
  initial: ArknightsApkCompatibilityRunRow,
  now: Date
): Promise<void> {
  let row = initial;
  try {
    if (Date.parse(row.deadline_at) <= now.getTime()) {
      await saveCompatibilityRun(
        env.DB,
        row,
        "timed_out",
        null,
        "Compatibility observation deadline exceeded",
        now
      );
      await notifyChange(env, runtime, row, "timed_out", "GitHub 任务等待或执行超时，请检查工作流");
      return;
    }
    if (
      row.dispatch_attempted_at === null &&
      (await claimCompatibilityDispatch(env.DB, row.id, now))
    ) {
      // Claim before POST: an ambiguous response is recovered by run-name, never blindly re-dispatched.
      const dispatched = await github(
        env,
        runtime,
        `/actions/workflows/${WORKFLOW}/dispatches`,
        GitHubDispatchSchema,
        {
          ref: ref(env),
          return_run_details: true,
          inputs: {
            job_id: row.id,
            apk_filename: row.apk_filename,
            apk_url: row.final_url,
            hook_sha: row.hook_commit
          }
        }
      );
      if (
        dispatched.run_url !== `${API}/actions/runs/${dispatched.workflow_run_id}` ||
        dispatched.html_url !==
          `https://github.com/${REPOSITORY}/actions/runs/${dispatched.workflow_run_id}`
      ) {
        throw new Error("Unexpected dispatched run identity");
      }
      await attachCompatibilityRun(
        env.DB,
        row.id,
        dispatched.workflow_run_id,
        dispatched.html_url,
        now
      );
      row = (await getCompatibilityRun(env.DB, row.id)) ?? row;
      await notifyChange(
        env,
        runtime,
        row,
        "queued",
        "兼容性检查已提交 GitHub Actions，与机器安装独立执行"
      );
    }
    if (row.github_run_id === null) {
      const list = await github(
        env,
        runtime,
        `/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref(env))}&per_page=100`,
        GitHubRunListSchema
      );
      const matches = list.workflow_runs.filter(
        (run) => run.display_title === `compatibility ${row.id}`
      );
      if (matches.length > 1) throw new Error("Multiple workflows match the business job");
      const match = matches[0];
      if (!match) {
        if (
          row.dispatch_attempted_at !== null &&
          now.getTime() - Date.parse(row.dispatch_attempted_at) >= 10 * 60_000
        ) {
          await saveCompatibilityRun(
            env.DB,
            row,
            "failed",
            null,
            "Workflow dispatch could not be confirmed; inspect GitHub before retrying",
            now
          );
          await notifyChange(
            env,
            runtime,
            row,
            "failed",
            "未找到对应工作流，请检查 GitHub 调度记录"
          );
        } else {
          await recordCompatibilityError(env.DB, row, "Waiting for GitHub workflow discovery", now);
        }
        return;
      }
      validateRun(env, row, match);
      await attachCompatibilityRun(env.DB, row.id, match.id, match.html_url, now);
      row = (await getCompatibilityRun(env.DB, row.id)) ?? row;
    }
    if (row.github_run_id === null) return;
    const run = await github(env, runtime, `/actions/runs/${row.github_run_id}`, GitHubRunSchema);
    validateRun(env, row, run);
    let status: CompatibilityStatus = run.status === "in_progress" ? "running" : "queued";
    let error: string | null = null;
    if (run.status === "completed") {
      status =
        run.conclusion === "success"
          ? "passed"
          : run.conclusion === "cancelled"
            ? "cancelled"
            : run.conclusion === "timed_out"
              ? "timed_out"
              : "failed";
      if (status !== "passed") error = `GitHub workflow conclusion: ${run.conclusion ?? "unknown"}`;
    }
    await saveCompatibilityRun(env.DB, row, status, run, error, now);
    if (status !== row.status && status !== "queued" && status !== "running") {
      await notifyChange(
        env,
        runtime,
        row,
        status,
        status === "passed"
          ? "Dump、启动热身与完整 fast 三星回放已通过"
          : (error ?? "兼容性工作流未通过")
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown compatibility error";
    await recordCompatibilityError(env.DB, row, message, now);
    (runtime.logger ?? console).error("GitHub compatibility check failed", {
      jobId: row.id,
      error: message
    });
  }
}

export async function startApkCompatibility(
  env: Env,
  runtime: CompatibilityRuntime,
  apkFilename: string,
  finalUrl: string,
  now: Date
): Promise<void> {
  try {
    const commit = await github(
      env,
      runtime,
      `/commits/${encodeURIComponent(ref(env))}`,
      GitHubCommitSchema
    );
    const input = { apk_filename: apkFilename, apk_url: finalUrl, hook_sha: commit.sha };
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([apkFilename, finalUrl, commit.sha]))
    );
    const id = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
    const created = await createCompatibilityRun(env.DB, id, input, now);
    if (!created) return;
    const row = await getCompatibilityRun(env.DB, id);
    if (!row) throw new Error("Compatibility record missing");
    if (row.status === "queued" || row.status === "running") await pollRun(env, runtime, row, now);
  } catch (error) {
    (runtime.logger ?? console).error(
      "GitHub compatibility submission failed; installation remains independent",
      { apkFilename, error: error instanceof Error ? error.message : "Unknown compatibility error" }
    );
  }
}

export async function advanceCompatibilityRuns(
  env: Env,
  runtime: CompatibilityRuntime,
  now: Date
): Promise<void> {
  for (const row of await dueCompatibilityRuns(env.DB, now)) await pollRun(env, runtime, row, now);
}
