export const MANAGED_GCP_VPS_NAME_PREFIX = "ark-vps-";

export const VPS_HOST_FIELD_LIMITS = {
  defaultPort: 22,
  minPort: 1,
  maxPort: 65535
} as const;
