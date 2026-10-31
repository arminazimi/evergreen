import type { DependencyCheck } from "../check-dependency.js";

/** One deployed thing an export names, with the exact place in the file the claim rests on. */
export interface InventoryItem {
  importer: string;
  /** The export file as given on the command line. */
  file: string;
  /** RFC 6901 JSON Pointer to the version value; for a text export, `line:<n>`. */
  pointer: string;
  /** The resource's own name, such as a function or cluster name. Never an account id, ARN, or secret. */
  resource: string;
  /** Version-less PURL the lifecycle rules are written against. */
  purl: string;
  version?: string;
}

/** Turns one export file into items. Reads the given document only: no network, no commands, no other files. */
export interface InventoryImporter {
  id: string;
  /** Registry files, by name under `registry/`, whose rules this importer's PURLs match. */
  registries: readonly string[];
  /** True when the document is this importer's format. Must not throw. */
  detect(document: unknown, file: string): boolean;
  /** Shapes the importer does not know are skipped, never guessed. */
  items(document: unknown, file: string): InventoryItem[];
}

export interface InventoryResult {
  item: InventoryItem;
  check: DependencyCheck;
}

export interface InventoryReport {
  schemaVersion: "evergreen.inventory.v1";
  results: InventoryResult[];
  /** Files no importer recognized, as given. */
  unrecognized: string[];
}
