import { LOG_READ_BYTES } from "../../constants/apk-delivery/config";
import { isSafeApkFilename } from "./apk";

// These on-host protocol values stay stable so existing Helper runs remain observable.
export const HOST_PROCESS_META_MARKER = "__ARK_WATCHER_PROCESS_META__";

function assertSafeApkFilename(apkFilename: string): void {
  if (!isSafeApkFilename(apkFilename)) {
    throw new Error("unsafe_apk_filename");
  }
}

export function buildStartCommand(apkFilename: string): string {
  assertSafeApkFilename(apkFilename);
  const base = `~/ark-watcher-logs/${apkFilename}`;
  const homeBase = `$HOME/ark-watcher-logs/${apkFilename}`;
  return [
    "mkdir -p ~/ark-watcher-logs",
    `if [ -s ${base}.pid ] && kill -0 "$(cat ${base}.pid)" 2>/dev/null; then`,
    "  echo already_running",
    "else",
    `  rm -f ${base}.exit ${base}.exit.tmp`,
    `  nohup sh -c '$HOME/Helper -g; code=$?; printf "%s\\n" "$code" > "${homeBase}.exit.tmp"; mv "${homeBase}.exit.tmp" "${homeBase}.exit"; exit "$code"' > ${base}.log 2>&1 &`,
    `  echo $! > ${base}.pid`,
    "  echo started:$!",
    "fi",
  ].join("\n");
}

export function buildLogTailCommand(apkFilename: string): string {
  assertSafeApkFilename(apkFilename);
  const base = `~/ark-watcher-logs/${apkFilename}`;
  return [
    `tail -c ${LOG_READ_BYTES} ${base}.log 2>/dev/null || true`,
    `printf '\\n${HOST_PROCESS_META_MARKER}\\n'`,
    `if [ -s ${base}.pid ] && kill -0 "$(cat ${base}.pid)" 2>/dev/null; then`,
    "  echo state=running",
    "  echo exit_code=unknown",
    `elif [ -s ${base}.exit ] && grep -Eq '^[0-9]+$' ${base}.exit; then`,
    "  echo state=exited",
    `  printf 'exit_code=%s\\n' "$(cat ${base}.exit)"`,
    "else",
    "  echo state=unknown",
    "  echo exit_code=unknown",
    "fi",
  ].join("\n");
}
