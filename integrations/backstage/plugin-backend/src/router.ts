import type { LoggerService } from "@backstage/backend-plugin-api";
import { InputError, NotFoundError } from "@backstage/errors";
import express from "express";
import Router from "express-promise-router";

import { findService, type PortalCatalog } from "../../common/portal";
import { loadPortalCatalog } from "./loadPortal";

export interface RouterOptions {
  logger: LoggerService;
  /** Absolute path or http(s) URL of the portal export. */
  portalExportSource: string;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
}

export async function createRouter(options: RouterOptions): Promise<express.Router> {
  const { logger, portalExportSource, fetchImpl } = options;
  const router = Router();
  router.use(express.json());

  async function catalog(): Promise<PortalCatalog> {
    try {
      return await loadPortalCatalog(portalExportSource, fetchImpl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to load Evergreen portal export: ${message}`);
      throw error;
    }
  }

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/catalog", async (_req, res) => {
    res.json(await catalog());
  });

  router.get("/services", async (req, res) => {
    const servicePath = typeof req.query.path === "string" ? req.query.path : undefined;
    if (!servicePath || servicePath.trim() === "") {
      throw new InputError("query parameter path is required");
    }
    const match = findService(await catalog(), servicePath);
    if (!match) {
      throw new NotFoundError(`no Evergreen portal service matches path ${JSON.stringify(servicePath)}`);
    }
    res.json(match);
  });

  return router;
}
