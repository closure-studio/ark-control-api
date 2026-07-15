export const ROUTES = {
  admin: {
    vpsHosts: "/api/vps/hosts",
    vpsHost: (id: number | string) => `/api/vps/hosts/${id}`,
    vpsHostVerify: (id: number | string) => `/api/vps/hosts/${id}/verify`
  }
} as const;
