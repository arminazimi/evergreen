import type { RegistryV2Rule } from "../../src/registry.js";

/** Reviewer recorded on every importer draft. The bundled registries may never contain it. */
export const PENDING_REVIEWER = "pending-review";

/**
 * How an importer reaches the outside world. Importers get every byte through `fetchText`, so
 * tests replay recordings and no importer needs its own network code.
 */
export interface FetchOptions {
  /** Value for the `Accept` header, for sources that serve several formats from one URL. */
  accept?: string;
  /**
   * When set, the request is POST with this UTF-8 body. Importers that need POST (for example the OSV
   * query API) pass a JSON string here; recordings key on the body so two POSTs to the same URL stay distinct.
   */
  body?: string;
}

export class ImporterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImporterError";
  }
}

export interface ImporterContext {
  /** Returns a response body as text; throws an `ImporterError` unless the response is successful. */
  fetchText(url: string, options?: FetchOptions): Promise<string>;
  /** The moment of the run. It becomes each draft's `provenance.observedAt`. */
  readonly now: Date;
}

/** A rule as an importer produces it: everything except provenance, which the runner stamps. */
export type DraftRule = Omit<RegistryV2Rule, "provenance">;

export interface ImporterOutput {
  /** Complete v2 rules, not yet reviewed. */
  rules: DraftRule[];
  /** What the importer skipped or could not decide, in a stable order, for the reviewer. */
  notes: string[];
}

export interface Importer {
  /** Lowercase letters, numbers, and hyphens. Becomes `provenance.importer` and the command-line name. */
  readonly id: string;
  /** The registry the drafts belong to, for example `nodejs`. */
  readonly ecosystem: string;
  readonly description: string;
  /** The authoritative sources this importer reads. */
  readonly sources: readonly { title: string; url: string }[];
  /** Fetches, normalizes, and returns draft rules. It must not write files or read anything but `context`. */
  import(context: ImporterContext): Promise<ImporterOutput>;
}

/** What a run produces: drafts a maintainer reviews. Importers never write the registry. */
export interface DraftRegistry {
  importer: string;
  ecosystem: string;
  observedAt: string;
  rules: RegistryV2Rule[];
  notes: string[];
}

export async function fetchJson<T>(context: ImporterContext, url: string, options?: FetchOptions): Promise<T> {
  const text = await context.fetchText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Response from ${url} is not valid JSON.`);
  }
}
