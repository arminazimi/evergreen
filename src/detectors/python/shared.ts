import { readFile } from "node:fs/promises";

import { parse as parseToml } from "smol-toml";

import type { DirectDependency, ResolvedVersions, UnknownRecord } from "./types.js";

export function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

export function normalizePackageName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, "-");
}

export async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function lineContaining(contents: string, needle: string): number {
  const normalizedNeedle = needle.toLowerCase();
  const index = contents.split(/\r?\n/).findIndex((line) => line.toLowerCase().includes(normalizedNeedle));
  return index === -1 ? 1 : index + 1;
}

export function parseRequirement(value: string): { name: string; constraint: string } | undefined {
  const clean = value.trim();
  if (!clean || clean.startsWith("#") || clean.startsWith("-") || /^(?:git\+|https?:)/i.test(clean)) {
    return undefined;
  }
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]+\])?\s*(.*)$/.exec(clean);
  if (!match?.[1]) return undefined;
  return {
    name: normalizePackageName(match[1]),
    constraint: (match[2] ?? "").split(";")[0]?.trim() ?? "",
  };
}

export function addDependency(
  target: Map<string, DirectDependency>,
  path: string,
  contents: string,
  rawName: string,
  constraint: string,
  explicitLine?: number,
): void {
  const name = normalizePackageName(rawName);
  if (!name || target.has(name)) return;
  target.set(name, {
    name,
    path,
    line: explicitLine ?? lineContaining(contents, rawName),
    constraint,
  });
}

/** An exact `==` or `===` pin is a version Evergreen can see, so it counts as resolved. A range is not a pin. */
export function addExactPin(resolved: ResolvedVersions, name: string, constraint: string): void {
  const exact = /^===?\s*([^\s,;]+)$/.exec(constraint)?.[1];
  if (exact) addResolved(resolved, name, exact);
}

export function addResolved(target: ResolvedVersions, rawName: string, rawVersion: unknown): void {
  if (typeof rawVersion !== "string") return;
  const version = rawVersion.trim().replace(/^[=~<>!^\s]+/, "");
  if (!version) return;
  const name = normalizePackageName(rawName);
  const versions = target.get(name) ?? new Set<string>();
  versions.add(version);
  target.set(name, versions);
}

/** A TOML document that does not parse pins nothing; it never fails the scan. */
export function parseTomlDocument(contents: string): UnknownRecord | undefined {
  try {
    return asRecord(parseToml(contents));
  } catch {
    return undefined;
  }
}
