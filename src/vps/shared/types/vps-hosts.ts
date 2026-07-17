export interface AdminVpsHost {
  id: number;
  name: string;
  address: string;
  port: number;
  username: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceVpsHost extends AdminVpsHost {
  password_ciphertext: string;
}

export interface CreateVpsHostRequest {
  name: string;
  address: string;
  port?: number;
  username: string;
  password: string;
}

export interface PatchVpsHostRequest {
  name?: string;
  address?: string;
  port?: number;
  username?: string;
  password?: string;
  enabled?: boolean;
}
