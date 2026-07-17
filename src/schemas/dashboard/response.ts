import * as v from "valibot";

const DashboardSummarySchema = v.object({
  accounts: v.object({
    total: v.number(),
    enabled: v.number()
  }),
  vps: v.object({
    total: v.number(),
    watcherEnabled: v.number()
  }),
  watcher: v.object({
    lastProcessedApkFilename: v.nullable(v.string()),
    hasNonTerminalHostRuns: v.boolean(),
    nonTerminalHostRunCount: v.number()
  })
});

const DashboardReleaseSchema = v.object({
  id: v.number(),
  apkFilename: v.string(),
  finalUrl: v.string(),
  createdAt: v.string(),
  statusCounts: v.record(v.string(), v.number())
});

const DashboardOperationSchema = v.object({
  id: v.number(),
  batchId: v.string(),
  accountId: v.nullable(v.number()),
  accountName: v.nullable(v.string()),
  projectId: v.string(),
  zone: v.string(),
  instanceName: v.string(),
  action: v.string(),
  status: v.string(),
  message: v.nullable(v.string()),
  googleOperationName: v.nullable(v.string()),
  createdAt: v.string()
});

export const DashboardResponseSchema = v.object({
  generatedAt: v.string(),
  summary: DashboardSummarySchema,
  recentReleases: v.array(DashboardReleaseSchema),
  recentOperations: v.array(DashboardOperationSchema)
});

export type DashboardResponse = v.InferOutput<typeof DashboardResponseSchema>;
