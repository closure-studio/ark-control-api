export const DEFAULT_VPS_MACHINE_TYPE = "n4a-custom-8-16384";

export const DEFAULT_VPS_BOOT_IMAGE =
  "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts-arm64";

export const DEFAULT_VPS_BOOT_DISK = {
  sizeGb: "60",
  type: "hyperdisk-balanced",
  provisionedIops: "3360",
  provisionedThroughput: "230"
} as const;

export const DEFAULT_VPS_NETWORK_TAGS = [
  "http-server",
  "https-server",
  "lb-health-check"
] as const;

export const DEFAULT_VPS_SSH_USERNAME = "root";
export const DEFAULT_VPS_SSH_PASSWORD = "GCP@2020.";

export type DefaultVpsStartupScriptOptions = {
  pyHelperArm64DownloadUrl?: string;
  pyHelperAmd64DownloadUrl?: string;
};

function pyHelperStartupLines(options: DefaultVpsStartupScriptOptions): string[] {
  if (!options.pyHelperArm64DownloadUrl || !options.pyHelperAmd64DownloadUrl) {
    return [];
  }

  return [
    "case \"$(uname -m)\" in",
    `  aarch64|arm64) pyhelper_url="${options.pyHelperArm64DownloadUrl}" ;;`,
    `  x86_64|amd64) pyhelper_url="${options.pyHelperAmd64DownloadUrl}" ;;`,
    "  *) echo \"Unsupported CPU architecture: $(uname -m)\" >&2; exit 1 ;;",
    "esac",
    "curl -fL \"${pyhelper_url}\" -o ~/Helper",
    "chmod 777 ~/Helper",
    "non_screenshot_count=\"$(nproc)\"",
    "~/Helper --init --screenshot-count 0 --non-screenshot-count \"${non_screenshot_count}\" --no-gpu --redroid-version 12 2>&1 | tee /var/log/ark-pyhelper-init.log",
    "~/Helper -s 2>&1 | tee /var/log/ark-pyhelper-start.log",
    "install -d -m 0755 ~/redroid",
    "crontab -l > mycron || true",
    "echo \"*/5 * * * *  ~/Helper --Surveillance >> ~/redroid/surveillance.log\" >> mycron",
    "echo \"30 4 * * *  ~/Helper -r >> ~/redroid/restart.log\" >> mycron",
    "crontab mycron",
    "rm mycron"
  ];
}

export function buildDefaultVpsStartupScript(
  options: DefaultVpsStartupScriptOptions = {}
): string {
  return [
    "#!/usr/bin/env bash",
    "set -euxo pipefail",
    "if [ -f /var/lib/ark-vps-env.done ]; then",
    "  exit 0",
    "fi",
    "export DEBIAN_FRONTEND=noninteractive",
    `echo '${DEFAULT_VPS_SSH_USERNAME}:${DEFAULT_VPS_SSH_PASSWORD}' | chpasswd`,
    "apt-get update",
    "apt-get upgrade -y",
    "apt-get install -y sudo curl ca-certificates kmod",
    "cat > /etc/ssh/sshd_config <<'SSH_CONFIG'",
    "Port 22",
    "PermitRootLogin yes",
    "PasswordAuthentication yes",
    "PubkeyAuthentication yes",
    "UsePAM yes",
    "Subsystem sftp /usr/lib/openssh/sftp-server",
    "SSH_CONFIG",
    "rm -rf /etc/ssh/sshd_config.d",
    "systemctl restart ssh || systemctl restart sshd",
    "curl -fsSL https://get.docker.com -o /root/get-docker.sh",
    "sh /root/get-docker.sh",
    "current_kernel=\"$(uname -r)\"",
    "apt-get install -y \"linux-modules-extra-${current_kernel}\" || apt-get install -y linux-modules-extra-gcp || apt-get install -y linux-generic",
    "case \"${current_kernel}\" in",
    "  *-gcp) apt-get install -y linux-modules-extra-gcp ;;",
    "  *-generic) apt-get install -y linux-generic ;;",
    "esac",
    "install -d -m 0755 /etc/modules-load.d /etc/modprobe.d /var/lib",
    "printf '%s\\n' binder_linux > /etc/modules-load.d/99-binder-linux.conf",
    "printf '%s\\n' 'options binder_linux devices=\"binder,hwbinder,vndbinder\"' > /etc/modprobe.d/99-binder-linux.conf",
    "modprobe binder_linux devices=\"binder,hwbinder,vndbinder\"",
    "install -d -m 0755 /dev/binderfs",
    "cat > /etc/systemd/system/dev-binderfs.mount <<'BINDERFS_MOUNT'",
    "[Unit]",
    "Description=Android Binder Filesystem",
    "After=systemd-modules-load.service",
    "",
    "[Mount]",
    "What=binder",
    "Where=/dev/binderfs",
    "Type=binder",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "BINDERFS_MOUNT",
    "systemctl daemon-reload",
    "systemctl enable --now dev-binderfs.mount",
    ...pyHelperStartupLines(options),
    "touch /var/lib/ark-vps-env.done"
  ].join("\n");
}

export const DEFAULT_VPS_STARTUP_SCRIPT = buildDefaultVpsStartupScript();
