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

export type CreateVpsHostRequest = InferInput<typeof CreateVpsHostSchema>;
export type PatchVpsHostRequest = InferOutput<typeof PatchVpsHostSchema>;
import type { InferInput, InferOutput } from "valibot";
import type {
  CreateVpsHostSchema,
  PatchVpsHostSchema
} from "../../schemas/vps/hosts";
