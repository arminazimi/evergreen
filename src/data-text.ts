import { type DataStatus, STALE_AFTER_DAYS } from "@velella/ebb/data-status";
import type { DataUpdateResult } from "@velella/ebb/data-update";
import type { DataInfo } from "@velella/ebb/domain";

/** The text forms of Ebb's data results, worded for this CLI. */

/** The sentence shown wherever stale data would otherwise go unnoticed. */
export const staleDataWarning = (info: Pick<DataInfo, "ageDays">): string =>
  `The lifecycle data is ${info.ageDays} days old (stale after ${STALE_AFTER_DAYS}). Findings may be missing recent changes; run "evergreen data update".`;

export function renderDataStatusText(status: DataStatus): string {
  const lines = [
    "Evergreen lifecycle data",
    `Source: ${status.source}${status.source === "bundled" ? " (shipped with this Evergreen release)" : ""}`,
    `Version: ${status.version}`,
    status.createdAt ? `Built: ${status.createdAt}` : "Built: not recorded for bundled data",
    `Evidence reviewed through: ${status.reviewedThrough}`,
    `Age: ${status.ageDays} day${status.ageDays === 1 ? "" : "s"} since ${status.ageBasis === "createdAt" ? "the bundle was built" : "the evidence was last reviewed"}${status.stale ? ` — older than ${status.staleAfterDays} days, so it is stale` : ""}`,
  ];
  if (status.contentDigest) lines.push(`Content digest: ${status.contentDigest}`);
  if (status.signer) lines.push(`Signed by: ${status.signer.identity}`, `Issuer: ${status.signer.issuer}`);
  else lines.push("Signature: not applicable (bundled data ships inside the installed package)");
  lines.push(`Cache directory: ${status.cacheDirectory}`);
  for (const warning of status.warnings) lines.push("", `Warning: ${warning}`);
  if (status.stale) lines.push("", "Update with: evergreen data update");
  return lines.join("\n");
}

export function renderDataUpdateText(result: DataUpdateResult): string {
  const lines =
    result.status === "up-to-date"
      ? [`Lifecycle data is up to date: ${result.to.version}.`]
      : result.status === "downloaded"
        ? [
            `Downloaded lifecycle data ${result.to.version}. It is not active until you pin it: evergreen scan --data-version ${result.to.version}, or EVERGREEN_DATA_VERSION=${result.to.version}.`,
          ]
        : [
            `Updated lifecycle data: ${result.from.version} (${result.from.source}) → ${result.to.version} (${result.to.source}).`,
          ];
  const changes = Object.entries(result.rules)
    .map(([name, { before, after }]) =>
      before === null
        ? `${name}: ${after} rules (new)`
        : before === after
          ? undefined
          : `${name}: ${before} → ${after} rules`,
    )
    .filter((line): line is string => line !== undefined);
  if (result.status === "updated")
    lines.push(
      changes.length > 0 ? `Rules: ${changes.join("; ")}.` : "Rule counts are unchanged; the evidence was refreshed.",
    );
  if (result.signer) lines.push(`Signed by: ${result.signer.identity}`);
  lines.push(`Stored in: ${result.cacheDirectory}`);
  return lines.join("\n");
}
