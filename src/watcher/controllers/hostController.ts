import { listVpsHosts } from "../services/vpsService";
import type { Env, ServiceVpsHost } from "../types";
import { jsonResponse } from "../utils/http";

type PublicHost = Pick<
  ServiceVpsHost,
  "id" | "name" | "address" | "port" | "username" | "verify_command" | "created_at" | "updated_at"
> & { enabled: boolean };

function toPublicHost(host: ServiceVpsHost): PublicHost {
  return {
    id: host.id,
    name: host.name,
    address: host.address,
    port: host.port,
    username: host.username,
    verify_command: host.verify_command,
    enabled: host.enabled === 1,
    created_at: host.created_at,
    updated_at: host.updated_at
  };
}

export async function listHosts(env: Env): Promise<Response> {
  const hosts = await listVpsHosts(env);
  return jsonResponse({
    hosts: hosts.map(toPublicHost),
  });
}
