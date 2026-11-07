// Reads a committed `.github/dependabot.yml` into the `updates` entries that define the surface
// Dependabot watches. Pure parsing: no network, and nothing in the file is executed.

import { parse } from "yaml";

import type { ConfigEntry } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/** The directory a `directory` or `directories` key declares, with non-string values skipped. */
function declaredDirectories(update: Record<string, unknown>): string[] {
  const values: unknown[] = [];
  if (Array.isArray(update.directories)) values.push(...update.directories);
  if (update.directory !== undefined) values.push(update.directory);
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

/**
 * The `updates` entries in a committed `dependabot.yml`, one per declared directory. Entries with no
 * `package-ecosystem` are skipped, because Dependabot does not accept them. A malformed document
 * throws, so the collector can record the error instead of silently reporting an empty surface.
 */
export function parseDependabotConfig(text: string): ConfigEntry[] {
  const document: unknown = parse(text);
  if (!isRecord(document)) throw new Error("dependabot.yml is not a mapping");
  const updates = document.updates;
  if (updates === undefined) return [];
  if (!Array.isArray(updates)) throw new Error("updates is not a list");

  const entries: ConfigEntry[] = [];
  for (const update of updates) {
    if (!isRecord(update)) continue;
    const packageEcosystem = update["package-ecosystem"];
    if (typeof packageEcosystem !== "string" || packageEcosystem.length === 0) continue;
    for (const directory of declaredDirectories(update)) {
      entries.push({
        packageEcosystem,
        directory,
        ignore: hasItems(update.ignore),
        allow: hasItems(update.allow),
      });
    }
  }
  return entries;
}

/** `apps/web/` and `/apps/web` name the same Dependabot directory; `/` stays `/`. */
export function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  if (trimmed === "" || trimmed === "/") return "/";
  const rooted = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return rooted.replace(/\/+$/, "") || "/";
}

function globSource(pattern: string): string {
  let source = "^";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index++;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return `${source}$`;
}

/**
 * Whether a `directory` or `directories` pattern contains an Evergreen finding's directory.
 * Dependabot accepts `*` (one path segment) and `**` (any depth) in `directories`.
 */
export function directoryMatches(pattern: string, directory: string): boolean {
  const expected = normalizeDirectory(directory);
  if (!/[*?]/.test(pattern)) return normalizeDirectory(pattern) === expected;
  return new RegExp(globSource(normalizeDirectory(pattern))).test(expected);
}
