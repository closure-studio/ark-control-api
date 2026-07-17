export interface VpsResource {
  id: number;
  name: string;
  address: string;
  port: number;
  username: string;
  watcherEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VpsInventoryResponse {
  vps: VpsResource[];
}
