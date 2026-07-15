import type { ServiceVpsHostsResponse } from "../../shared/types/vps-hosts";
import type { Env } from "../env";
import { sanitizeServiceHost, VpsHostRepository } from "../repositories/vps-hosts";

export async function listServiceVpsHosts(env: Env): Promise<ServiceVpsHostsResponse> {
  const rows = await new VpsHostRepository(env.DB).listAll();
  return { hosts: rows.map(sanitizeServiceHost) };
}
