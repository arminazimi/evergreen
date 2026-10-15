// Runs a lifecycle importer and prints its draft rules. Importers never write the registry.
//
//   node dist/tools/importers/run.js --list
//   node dist/tools/importers/run.js <importer-id> [--out drafts.json] [--now YYYY-MM-DD]
//                                    [--record responses.json | --replay responses.json]
//
// This is maintainer tooling and scheduled CI. Scans never use importers or the network.

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { REGISTRY_V2_SCHEMA_VERSION, isIsoDate, registryV2Issues } from "../../src/registry.js";
import type { RegistryV2Rule } from "../../src/registry.js";
import { canonicalRule, isoDate } from "./canonical.js";
import { readRecording, recordingContext, replayContext, writeRecording } from "./recording.js";
import { ImporterError, PENDING_REVIEWER } from "./types.js";
import type { DraftRegistry, Importer, ImporterContext } from "./types.js";

export { ImporterError };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Runs one importer and returns reviewable drafts. The runner owns provenance: it stamps each rule
 * with the run date, this importer's id, and the pending-review reviewer, so an importer cannot
 * present its output as reviewed.
 */
export async function runImporter(importer: Importer, context: ImporterContext): Promise<DraftRegistry> {
  const name = `Importer "${importer.id}"`;
  if (!SLUG.test(importer.id)) throw new ImporterError(`${name}: id must use lowercase letters, numbers, and hyphens.`);
  if (!SLUG.test(importer.ecosystem)) throw new ImporterError(`${name}: ecosystem must be a lowercase slug.`);

  const output = await importer.import(context);
  if (!Array.isArray(output.rules) || !Array.isArray(output.notes) || !output.notes.every((note) => typeof note === "string" && note.trim())) {
    throw new ImporterError(`${name}: must return rules and notes (a list of non-empty strings).`);
  }

  const observedAt = isoDate(context.now);
  const rules = output.rules.map((draft) => {
    if ("provenance" in draft) throw new ImporterError(`${name}: draft rules must not set provenance; the runner stamps it.`);
    return canonicalRule({
      ...draft,
      provenance: { observedAt, reviewedAt: observedAt, reviewer: PENDING_REVIEWER, importer: importer.id },
    }) as unknown as RegistryV2Rule;
  });
  rules.sort((left, right) => left.id.localeCompare(right.id));

  const issues = registryV2Issues({ schemaVersion: REGISTRY_V2_SCHEMA_VERSION, ecosystem: importer.ecosystem, rules });
  if (issues.length > 0) {
    throw new ImporterError(`${name} produced invalid draft rules:\n${issues.slice(0, 20).map((issue) => `- ${issue}`).join("\n")}`);
  }
  return { importer: importer.id, ecosystem: importer.ecosystem, observedAt, rules, notes: output.notes };
}

/** A context that reads from the network, for maintainer runs and scheduled CI. */
export function liveContext(now: Date = new Date(), timeoutMs = 30_000): ImporterContext {
  return {
    now,
    async fetchText(url, options) {
      let failure = "no attempt";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(url, {
            redirect: "follow",
            headers: { "user-agent": "evergreen-importer (+https://github.com/arminazimi/evergreen)", accept: options?.accept ?? "application/json,text/plain,text/html;q=0.8,*/*;q=0.5" },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (response.ok) return await response.text();
          failure = `HTTP ${response.status}`;
          if (response.status < 500) break;
        } catch (error) {
          failure = (error as Error).message.slice(0, 120);
        }
      }
      throw new ImporterError(`GET ${url} failed: ${failure}`);
    },
  };
}

export interface ExecuteOptions {
  /** Read from the network and save everything read to this file. */
  record?: string;
  /** Read only from this recording; the network is never used. */
  replay?: string;
  /** Run date (YYYY-MM-DD). Defaults to today, or to the recording's date when replaying. */
  now?: string;
}

/** Runs an importer live, while recording, or from a recording. */
export async function execute(importer: Importer, options: ExecuteOptions = {}): Promise<DraftRegistry> {
  if (options.record && options.replay) throw new ImporterError("Use either --record or --replay, not both.");
  if (options.now !== undefined && !isIsoDate(options.now)) throw new ImporterError("--now must be a date (YYYY-MM-DD).");
  const now = options.now ? new Date(`${options.now}T12:00:00Z`) : undefined;

  if (options.replay) {
    const recording = await readRecording(options.replay);
    if (recording.importer !== importer.id) throw new ImporterError(`Recording is for "${recording.importer}", not "${importer.id}".`);
    const replay = replayContext(recording, now);
    const drafts = await runImporter(importer, replay);
    const unused = replay.unused();
    if (unused.length > 0) {
      throw new ImporterError(`Recording has responses the importer no longer reads: ${unused.map((response) => response.url).join(", ")}. Record it again.`);
    }
    return drafts;
  }
  if (options.record) {
    const recorder = recordingContext(liveContext(now));
    try {
      return await runImporter(importer, recorder.context);
    } finally {
      await writeRecording(options.record, recorder.recording(importer.id));
    }
  }
  return runImporter(importer, liveContext(now));
}

async function registeredImporters(): Promise<readonly Importer[]> {
  return (await import("./index.js")).importers;
}

export async function main(argv: string[]): Promise<number> {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  let id: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--list") flags.add(argument);
    else if (argument.startsWith("--")) values.set(argument, argv[++index] ?? (() => { throw new ImporterError(`${argument} needs a value.`); })());
    else if (id === undefined) id = argument;
    else throw new ImporterError(`Unexpected argument "${argument}".`);
  }

  const importers = await registeredImporters();
  if (flags.has("--list")) {
    process.stdout.write(importers.length === 0
      ? "No importers are registered yet.\n"
      : `${importers.map((importer) => `${importer.id}\t${importer.ecosystem}\t${importer.description}`).join("\n")}\n`);
    return 0;
  }
  if (!id) throw new ImporterError("Usage: run <importer-id> [--out FILE] [--now DATE] [--record FILE | --replay FILE], or run --list");
  const importer = importers.find((candidate) => candidate.id === id);
  if (!importer) throw new ImporterError(`Unknown importer "${id}". Known: ${importers.map((candidate) => candidate.id).join(", ") || "none"}.`);

  const drafts = await execute(importer, {
    ...(values.has("--record") ? { record: values.get("--record")! } : {}),
    ...(values.has("--replay") ? { replay: values.get("--replay")! } : {}),
    ...(values.has("--now") ? { now: values.get("--now")! } : {}),
  });
  const text = `${JSON.stringify(drafts, null, 2)}\n`;
  if (values.has("--out")) await writeFile(values.get("--out")!, text);
  else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(1);
    },
  );
}
