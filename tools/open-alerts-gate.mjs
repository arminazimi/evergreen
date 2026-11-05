// Fail when a code-scanning or Dependabot alert is open that the baseline does not accept (issue #2070).
//
// Reads two JSON documents: the open code-scanning alerts and the open Dependabot alerts of
// the repository, as the REST API returns them (`gh api --paginate`, merged into one array per
// file). Every open alert whose key is not in tools/open-alerts-baseline.json is a new alert and
// fails the run, naming the alert and linking to it. The baseline is the list of alerts that were
// already open when this gate was added; it may only shrink. Fixing or dismissing a baselined
// alert is welcome, and the run reports the entry as stale so someone removes it.
//
// It reads files passed on the command line: no network, no child processes, and it never
// executes repository or fixture code.

import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export class OpenAlertsGateError extends Error {}

/**
 * Key of one alert: its kind and the number the API gives it. Numbers are unique within
 * one kind, so `code-scanning#236` names one alert for as long as the alert exists.
 * @param {"code-scanning" | "dependabot"} kind
 * @param {{ number: unknown }} alert
 */
export function alertKey(kind, alert) {
  return `${kind}#${alert.number}`;
}

/**
 * Turn the two API documents into the list of open alerts this gate judges.
 * Only `state: "open"` counts, even though the requests already filter on it.
 * @param {unknown} codeScanning array from GET /repos/{owner}/{repo}/code-scanning/alerts.
 * @param {unknown} dependabot array from GET /repos/{owner}/{repo}/dependabot/alerts.
 * @returns {{ key: string, summary: string, url: string }[]}
 */
export function openAlerts(codeScanning, dependabot) {
  if (!Array.isArray(codeScanning)) throw new OpenAlertsGateError("code-scanning alerts are not an array");
  if (!Array.isArray(dependabot)) throw new OpenAlertsGateError("Dependabot alerts are not an array");
  const alerts = [];
  for (const alert of codeScanning) {
    if (!isAlert(alert)) throw new OpenAlertsGateError("a code-scanning alert has no number");
    if (alert.state !== "open") continue;
    const rule = alert.rule?.id ?? "unknown rule";
    const path = alert.most_recent_instance?.location?.path ?? "no file";
    alerts.push({
      key: alertKey("code-scanning", alert),
      summary: `${rule} in ${path}`,
      url: String(alert.html_url ?? ""),
    });
  }
  for (const alert of dependabot) {
    if (!isAlert(alert)) throw new OpenAlertsGateError("a Dependabot alert has no number");
    if (alert.state !== "open") continue;
    const name = alert.dependency?.package?.name ?? "unknown package";
    const manifest = alert.dependency?.manifest_path ?? "unknown manifest";
    const advisory = alert.security_advisory?.ghsa_id ?? "no advisory id";
    alerts.push({
      key: alertKey("dependabot", alert),
      summary: `${name} in ${manifest} (${advisory})`,
      url: String(alert.html_url ?? ""),
    });
  }
  return alerts;
}

/**
 * @param {unknown} alert
 * @returns {alert is { number: number | string, state?: string }}
 */
function isAlert(alert) {
  return typeof alert === "object" && alert !== null && "number" in alert && alert.number !== undefined;
}

/**
 * Check the baseline document: a list of accepted keys, each with a written reason.
 * @param {unknown} baseline
 * @returns {string[]} problems; empty when the baseline is well formed.
 */
export function validateBaseline(baseline) {
  if (typeof baseline !== "object" || baseline === null || !Array.isArray(baseline.accepted)) {
    return ["the baseline needs an accepted array"];
  }
  const problems = [];
  const seen = new Set();
  for (const entry of baseline.accepted) {
    const key = typeof entry === "object" && entry !== null ? entry.key : undefined;
    if (typeof key !== "string" || !/^(code-scanning|dependabot)#\d+$/.test(key)) {
      problems.push(`an accepted entry has a bad key: ${JSON.stringify(key)}`);
      continue;
    }
    if (seen.has(key)) problems.push(`${key} is listed twice`);
    seen.add(key);
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      problems.push(`${key} has no written reason`);
    }
  }
  return problems;
}

/**
 * Compare the open alerts with the accepted baseline.
 * @param {readonly { key: string, summary: string, url: string }[]} open
 * @param {readonly string[]} acceptedKeys
 * @returns {{ fresh: { key: string, summary: string, url: string }[], stale: string[] }}
 */
export function findNewAlerts(open, acceptedKeys) {
  const accepted = new Set(acceptedKeys);
  const openKeys = new Set(open.map((alert) => alert.key));
  return {
    fresh: open.filter((alert) => !accepted.has(alert.key)),
    stale: acceptedKeys.filter((key) => !openKeys.has(key)),
  };
}

/** @param {readonly string[]} args command-line arguments after the script name. */
export function main(args) {
  const options = parseArgs(args);
  if (options === undefined) {
    console.error(
      "usage: node tools/open-alerts-gate.mjs --code-scanning <alerts.json> --dependabot <alerts.json> --baseline <open-alerts-baseline.json>",
    );
    return 2;
  }
  let open;
  let baseline;
  try {
    open = openAlerts(readJson(options.codeScanning), readJson(options.dependabot));
    baseline = readJson(options.baseline);
  } catch (error) {
    console.error(`cannot read the alerts: ${/** @type {Error} */ (error).message}`);
    return 2;
  }
  const problems = validateBaseline(baseline);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`bad baseline: ${problem}`);
    return 2;
  }
  const acceptedKeys = baseline.accepted.map((entry) => entry.key);
  const { fresh, stale } = findNewAlerts(open, acceptedKeys);
  for (const key of stale) {
    console.log(
      `::notice title=Stale baseline entry::${key} is no longer open; remove it from tools/open-alerts-baseline.json.`,
    );
  }
  if (fresh.length > 0) {
    for (const alert of fresh) {
      console.log(`::error title=New open alert::${alert.key}: ${alert.summary}. ${alert.url}`);
      console.log(`NEW OPEN ALERT: ${alert.key} ${alert.summary} ${alert.url}`);
    }
    console.log(
      `${fresh.length} open alert(s) not in the baseline. Fix them, or dismiss them with a reason in the alert's security tab.`,
    );
    return 1;
  }
  console.log(`No open alerts outside the baseline (${open.length} open, ${acceptedKeys.length} accepted).`);
  return 0;
}

/**
 * @param {readonly string[]} args
 * @returns {{ codeScanning: string, dependabot: string, baseline: string } | undefined}
 */
function parseArgs(args) {
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) return undefined;
    flags.set(name, value);
  }
  const codeScanning = flags.get("--code-scanning");
  const dependabot = flags.get("--dependabot");
  const baseline = flags.get("--baseline");
  if (flags.size !== 3 || !codeScanning || !dependabot || !baseline) return undefined;
  return { codeScanning, dependabot, baseline };
}

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
