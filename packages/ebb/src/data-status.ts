import type { DataInfo } from "./domain.js";
import { defaultCacheDirectory, getActiveData } from "./data-source.js";
import type { ActiveData } from "./data-source.js";

export const DATA_STATUS_SCHEMA_VERSION = "ebb.data-status.v1" as const;

/** Evidence older than this is called stale in every output. */
export const STALE_AFTER_DAYS = 30;

export interface DataStatus {
  schemaVersion: typeof DATA_STATUS_SCHEMA_VERSION;
  source: "bundled" | "cache" | "pinned";
  /** The bundle version, or the Ebb release for bundled data. */
  version: string;
  /** When a downloaded bundle was built; null for the bundled data. */
  createdAt: string | null;
  contentDigest: string | null;
  /** The most recent review date among the rules in use. */
  reviewedThrough: string;
  /** Days since `createdAt` for downloaded data, or since `reviewedThrough` for bundled data. */
  ageDays: number;
  ageBasis: "createdAt" | "reviewedThrough";
  staleAfterDays: number;
  stale: boolean;
  signer: { identity: string; issuer: string } | null;
  cacheDirectory: string;
  warnings: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/** The compact description of the data in use that is attached to scan and check results. */
export function dataInfoFrom(data: ActiveData, now: Date = new Date()): DataInfo {
  const { source, version, createdAt, reviewedThrough, ageDays, stale } = dataStatusFrom(data, now);
  return { source, version, createdAt, reviewedThrough, ageDays, stale };
}


export function dataStatusFrom(
  data: ActiveData,
  now: Date = new Date(),
  cacheDirectory: string = defaultCacheDirectory(),
): DataStatus {
  const { info } = data;
  const ageBasis = info.createdAt ? "createdAt" : "reviewedThrough";
  const since = Date.parse(info.createdAt ?? `${info.reviewedThrough}T00:00:00Z`);
  const ageDays = Number.isNaN(since) ? 0 : Math.max(0, Math.floor((now.getTime() - since) / DAY));
  return {
    schemaVersion: DATA_STATUS_SCHEMA_VERSION,
    source: info.source,
    version: info.version,
    createdAt: info.createdAt,
    contentDigest: info.contentDigest,
    reviewedThrough: info.reviewedThrough,
    ageDays,
    ageBasis,
    staleAfterDays: STALE_AFTER_DAYS,
    stale: ageDays > STALE_AFTER_DAYS,
    signer: info.signer,
    cacheDirectory,
    warnings: info.warnings,
  };
}

/** Which lifecycle data is active, and how old it is. Reads local files only. */
export async function getDataStatus(now: Date = new Date()): Promise<DataStatus> {
  return dataStatusFrom(await getActiveData(), now);
}

