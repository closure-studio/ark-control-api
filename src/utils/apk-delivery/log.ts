import { LOG_TAIL_BYTES } from "../../constants/apk-delivery/config";
import type {
  HostLogSnapshot,
  HostProcessState
} from "../../schemas/apk-delivery/log";
import { HOST_PROCESS_META_MARKER } from "./shell";

const ANSI_ESCAPE_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;

function truncateUtf8Tail(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }

  let start = bytes.length - maxBytes;
  while (start < bytes.length && ((bytes[start] ?? 0) & 0xc0) === 0x80) {
    start += 1;
  }
  return new TextDecoder().decode(bytes.slice(start));
}

function compactLog(rawLog: string): string {
  const lines: string[] = [];

  for (const rawLine of rawLog.replace(ANSI_ESCAPE_PATTERN, "").replaceAll("\r", "\n").split("\n")) {
    let line = rawLine.trimEnd();
    if (/\d{1,3}%\|/.test(line) || line.includes("Starting Redroid...:")) {
      const timestampIndex = line.search(TIMESTAMP_PATTERN);
      if (timestampIndex === -1) {
        continue;
      }
      line = line.slice(timestampIndex);
    }

    if (line.length === 0 || lines.at(-1) === line) {
      continue;
    }
    lines.push(line);
  }

  return truncateUtf8Tail(lines.join("\n"), LOG_TAIL_BYTES);
}

function parseExitCode(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const exitCode = Number(value);
  return Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255 ? exitCode : null;
}

export function parseHostLogSnapshot(stdout: string): HostLogSnapshot {
  const marker = `\n${HOST_PROCESS_META_MARKER}\n`;
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex === -1) {
    return {
      logTail: compactLog(stdout),
      processState: "unknown",
      exitCode: null,
    };
  }

  const metadata = new Map(
    stdout
      .slice(markerIndex + marker.length)
      .trim()
      .split("\n")
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return separatorIndex === -1 ? [line, ""] : [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
  const rawState = metadata.get("state");
  const processState: HostProcessState = rawState === "running" || rawState === "exited" ? rawState : "unknown";
  const exitCode = processState === "exited" ? parseExitCode(metadata.get("exit_code")) : null;

  return {
    logTail: compactLog(stdout.slice(0, markerIndex)),
    processState: processState === "exited" && exitCode === null ? "unknown" : processState,
    exitCode,
  };
}
