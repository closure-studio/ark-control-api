import type { TerminalHostRunStatus } from "../../constants/watcher/status";

export type NotificationEventType = "pipeline_started" | "helper_deploy_terminal";

export interface PipelineStartedNotification {
  type: "pipeline_started";
  apkFilename: string;
}

export interface HelperDeployTerminalNotification {
  type: "helper_deploy_terminal";
  hostId: number;
  hostName: string;
  apkFilename: string;
  status: TerminalHostRunStatus;
  result: string;
}

export type NotificationEvent = PipelineStartedNotification | HelperDeployTerminalNotification;

export interface NotificationMessage {
  eventType: NotificationEventType;
  message: string;
}

const TERMINAL_STATUS_MESSAGES: Record<TerminalHostRunStatus, { title: string; label: string }> = {
  succeeded: { title: "✅ Helper 部署完成", label: "成功" },
  failed: { title: "❌ Helper 部署失败", label: "失败" },
  timed_out: { title: "⏱️ Helper 部署超时", label: "超时" },
};

export function buildNotificationMessage(event: NotificationEvent): NotificationMessage {
  switch (event.type) {
    case "pipeline_started":
      return {
        eventType: event.type,
        message: `📦 检测到新版本\n\nAPK：${event.apkFilename}\n状态：开始部署`,
      };
    case "helper_deploy_terminal": {
      const statusMessage = TERMINAL_STATUS_MESSAGES[event.status];
      return {
        eventType: event.type,
        message: `${statusMessage.title}\n\n主机：${event.hostName}\n状态：${statusMessage.label}\n结果：${event.result}`,
      };
    }
  }
}
