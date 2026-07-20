import { describe, expect, it } from "vitest";
import * as v from "valibot";

import {
  HostLogSnapshotSchema,
  HostProcessStateSchema
} from "../src/schemas/apk-delivery/log";
import {
  NotificationEventSchema,
  NotificationMessageSchema
} from "../src/schemas/apk-delivery/notifications";
import {
  HostRunStatusSchema,
  TerminalHostRunStatusSchema,
  isTerminalHostRunStatus
} from "../src/schemas/apk-delivery/status";
import { parseHostLogSnapshot } from "../src/utils/apk-delivery/log";
import { buildNotificationMessage } from "../src/utils/apk-delivery/notification-message";
import { HOST_PROCESS_META_MARKER } from "../src/utils/apk-delivery/shell";

describe("APK delivery contracts", () => {
  it("validates host run and terminal status values", () => {
    expect(v.safeParse(HostRunStatusSchema, "pending").success).toBe(true);
    expect(v.safeParse(HostRunStatusSchema, "invalid").success).toBe(false);
    expect(v.safeParse(TerminalHostRunStatusSchema, "timed_out").success).toBe(true);
    expect(v.safeParse(TerminalHostRunStatusSchema, "running").success).toBe(false);
    expect(isTerminalHostRunStatus("succeeded")).toBe(true);
    expect(isTerminalHostRunStatus("running")).toBe(false);
  });

  it("validates normalized host log snapshots", () => {
    const snapshot = parseHostLogSnapshot(
      `deployment complete\n${HOST_PROCESS_META_MARKER}\nstate=exited\nexit_code=0`
    );

    expect(snapshot).toEqual({
      logTail: "deployment complete",
      processState: "exited",
      exitCode: 0
    });
    expect(v.safeParse(HostLogSnapshotSchema, snapshot).success).toBe(true);
    expect(v.safeParse(HostProcessStateSchema, "stopped").success).toBe(false);
    expect(
      v.safeParse(HostLogSnapshotSchema, {
        logTail: "failed",
        processState: "exited",
        exitCode: 256
      }).success
    ).toBe(false);
  });

  it("validates notification variants and generated messages", () => {
    const event = {
      type: "helper_deploy_terminal",
      hostId: 7,
      hostName: "host-a",
      apkFilename: "release.apk",
      status: "failed",
      result: "command failed"
    } as const;

    expect(v.safeParse(NotificationEventSchema, event).success).toBe(true);
    expect(v.safeParse(NotificationMessageSchema, buildNotificationMessage(event)).success).toBe(
      true
    );
    expect(
      v.safeParse(NotificationEventSchema, {
        ...event,
        status: "running"
      }).success
    ).toBe(false);
    expect(
      v.safeParse(NotificationEventSchema, {
        type: "deployment_started",
        hostId: 7
      }).success
    ).toBe(false);
  });
});
