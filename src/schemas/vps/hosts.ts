import * as v from "valibot";
import { VPS_HOST_FIELD_LIMITS } from "../../constants/vps/fields";
import { objectSchema } from "../object";

function requiredString(field: string) {
  return v.pipe(
    v.string(`${field} is required`),
    v.trim(),
    v.nonEmpty(`${field} is required`)
  );
}

const PasswordSchema = v.pipe(
  v.string("password is required"),
  v.check((value) => value.trim().length > 0, "password is required")
);

const PortSchema = v.pipe(
  v.number("port must be an integer between 1 and 65535"),
  v.integer("port must be an integer between 1 and 65535"),
  v.minValue(
    VPS_HOST_FIELD_LIMITS.minPort,
    "port must be an integer between 1 and 65535"
  ),
  v.maxValue(
    VPS_HOST_FIELD_LIMITS.maxPort,
    "port must be an integer between 1 and 65535"
  )
);

const CreateVpsHostEntries = {
  name: requiredString("name"),
  address: requiredString("address"),
  port: v.optional(PortSchema, VPS_HOST_FIELD_LIMITS.defaultPort),
  username: requiredString("username"),
  password: PasswordSchema
};

const PatchVpsHostEntries = {
  name: v.exactOptional(requiredString("name")),
  address: v.exactOptional(requiredString("address")),
  port: v.exactOptional(PortSchema),
  username: v.exactOptional(requiredString("username")),
  password: v.exactOptional(v.union([v.literal(""), PasswordSchema])),
  enabled: v.exactOptional(v.boolean("enabled must be a boolean"))
};

export const CreateVpsHostSchema = objectSchema(CreateVpsHostEntries);
export const PatchVpsHostSchema = objectSchema(PatchVpsHostEntries);

export const CreateVpsRequestSchema = objectSchema({
  ...CreateVpsHostEntries,
  watcherEnabled: v.exactOptional(v.boolean("watcherEnabled must be a boolean"))
});

export const PatchVpsRequestSchema = objectSchema({
  name: PatchVpsHostEntries.name,
  address: PatchVpsHostEntries.address,
  port: PatchVpsHostEntries.port,
  username: PatchVpsHostEntries.username,
  password: PatchVpsHostEntries.password,
  watcherEnabled: v.exactOptional(v.boolean("watcherEnabled must be a boolean"))
});

export type CreateVpsHost = v.InferOutput<typeof CreateVpsHostSchema>;
export type PatchVpsHost = v.InferOutput<typeof PatchVpsHostSchema>;
