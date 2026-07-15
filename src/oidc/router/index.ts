import { Hono } from "hono";

import { healthController } from "../controller/health";
import {
  oidcDiscoveryController,
  oidcJwksController,
  oidcTokenController,
} from "../controller/oidc";
import { rootController } from "../controller/root";
import type { Env } from "../model/env";

const router = new Hono<{ Bindings: Env }>();

router.get("/", rootController);
router.get("/health", healthController);
router.get("/.well-known/openid-configuration", oidcDiscoveryController);
router.get("/jwks.json", oidcJwksController);
router.get("/token", oidcTokenController);
router.post("/token", oidcTokenController);

export { router };
