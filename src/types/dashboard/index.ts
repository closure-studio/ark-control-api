export interface DashboardResponse {
  generatedAt: string;
  summary: {
    accounts: { total: number; enabled: number };
    vps: {
      total: number;
      watcherEnabled: number;
    };
    watcher: {
      lastProcessedApkFilename: string | null;
      hasNonTerminalHostRuns: boolean;
      nonTerminalHostRunCount: number;
    };
  };
  recentReleases: Array<{
    id: number;
    apkFilename: string;
    finalUrl: string;
    createdAt: string;
    statusCounts: Record<string, number>;
  }>;
  recentOperations: Array<{
    id: number;
    batchId: string;
    accountId: number | null;
    accountName: string | null;
    projectId: string;
    zone: string;
    instanceName: string;
    action: string;
    status: string;
    message: string | null;
    googleOperationName: string | null;
    createdAt: string;
  }>;
}
