import type { DetectorInputs } from "./sdk.js";

function wildcard(pattern: string): RegExp {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${source}$`, "i");
}

/**
 * Whether `path` (relative to the scanned root, forward slashes) is a file `inputs` declares. A path matches when
 * its base name is one of `fileNames`, ends with one of `extensions` or `sourceExtensions`, or lies under one of
 * `directories` at any depth. Names and extensions compare case-insensitively.
 */
export function declaresInput(inputs: DetectorInputs, path: string): boolean {
  const normalized = path.split("\\").join("/").replace(/^\.\//, "");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
  if (inputs.fileNames?.some((name) => wildcard(name).test(base))) return true;
  if (inputs.extensions?.some((extension) => base.endsWith(extension.toLowerCase()))) return true;
  if (inputs.sourceExtensions?.some((extension) => base.endsWith(extension.toLowerCase()))) return true;
  return (inputs.directories ?? []).some((directory) => {
    const prefix = `${directory.replace(/\/+$/, "")}/`;
    return normalized.startsWith(prefix) || normalized.includes(`/${prefix}`);
  });
}
