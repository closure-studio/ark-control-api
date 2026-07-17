import * as v from "valibot";
import { objectSchema } from "../object";

const RequiredAccountFields = {
  projectId: v.pipe(v.string(), v.trim(), v.nonEmpty("Project id is required.")),
  serviceAccountEmail: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("Service account email is required.")
  ),
  workloadIdentityProvider: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("Workload identity provider is required.")
  ),
  defaultZone: v.pipe(v.string(), v.trim(), v.nonEmpty("Default zone is required."))
};

export const CreateGcpAccountRequestSchema = objectSchema({
  name: v.pipe(v.string(), v.trim(), v.nonEmpty("Account name is required.")),
  ...RequiredAccountFields
});

export const RegisterGcpAccountRequestSchema = objectSchema({
  id: v.exactOptional(v.string()),
  name: v.exactOptional(v.string()),
  ...RequiredAccountFields
});

export const UpdateGcpAccountRequestSchema = objectSchema({
  name: v.exactOptional(
    v.pipe(v.string(), v.trim(), v.nonEmpty("Account name is required."))
  ),
  projectId: v.exactOptional(RequiredAccountFields.projectId),
  serviceAccountEmail: v.exactOptional(RequiredAccountFields.serviceAccountEmail),
  workloadIdentityProvider: v.exactOptional(RequiredAccountFields.workloadIdentityProvider),
  defaultZone: v.exactOptional(RequiredAccountFields.defaultZone),
  enabled: v.exactOptional(v.boolean())
});

export type CreateGcpAccountRequest = v.InferOutput<typeof CreateGcpAccountRequestSchema>;
export type RegisterGcpAccountRequest = v.InferOutput<typeof RegisterGcpAccountRequestSchema>;
export type UpdateGcpAccountRequest = v.InferOutput<typeof UpdateGcpAccountRequestSchema>;
