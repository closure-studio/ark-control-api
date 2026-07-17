import * as v from "valibot";

export const GcpAccountSchema = v.object({
  id: v.number(),
  name: v.string(),
  projectId: v.string(),
  serviceAccountEmail: v.string(),
  workloadIdentityProvider: v.string(),
  defaultZone: v.string(),
  enabled: v.boolean(),
  createdAt: v.string(),
  updatedAt: v.string()
});

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

export const CreateGcpAccountRequestSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.nonEmpty("Account name is required.")),
  ...RequiredAccountFields
});

export const RegisterGcpAccountRequestSchema = v.object({
  id: v.exactOptional(v.string()),
  name: v.exactOptional(v.string()),
  ...RequiredAccountFields
});

export const UpdateGcpAccountRequestSchema = v.object({
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
export type GcpAccount = v.InferOutput<typeof GcpAccountSchema>;
