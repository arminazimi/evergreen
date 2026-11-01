import { rubyDriftCollector } from "./ruby.js";
import { javaCollector } from "./java.js";
import { dotnetCollector } from "./dotnet.js";
import type { DriftCollector, DriftReport, RuntimeDrift, RuntimePin } from "./types.js";
import { rustDriftCollector } from "./rust.js";
import { pythonCollector } from "./python.js";
import { goDriftCollector } from "./go.js";
import { nodejsDriftCollector } from "./nodejs.js";

export type { DriftCollector, DriftReport, RuntimeDrift, RuntimePin } from "./types.js";

/** Every built-in collector, one per runtime. Each task in the drift epic appends its own entry. */
export const driftCollectors: DriftCollector[] = [goDriftCollector, pythonCollector, rustDriftCollector, dotnetCollector, javaCollector, rubyDriftCollector, nodejsDriftCollector];

/** Compares dotted numeric releases such as `3.9` and `3.11`; non-numeric parts compare as text. */
export function compareReleases(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const l = left[index] ?? "0";
    const r = right[index] ?? "0";
    const ln = Number(l);
    const rn = Number(r);
    const order = Number.isInteger(ln) && Number.isInteger(rn) ? ln - rn : l.localeCompare(r);
    if (order !== 0) return order;
  }
  return 0;
}

function byLocation(a: RuntimePin, b: RuntimePin): number {
  return a.path.localeCompare(b.path) || a.line - b.line || a.source.localeCompare(b.source);
}

/** Runs every collector over a repository and reports, per runtime, whether its pins agree. Deterministic. */
export async function analyzeDrift(root: string, collectors: readonly DriftCollector[] = driftCollectors): Promise<DriftReport> {
  const runtimes: RuntimeDrift[] = [];
  for (const collector of collectors) {
    const pins = [...(await collector.collect(root))].sort(byLocation);
    if (pins.length === 0) continue;
    const pinned = pins.filter((pin) => pin.kind === "pin" && pin.release !== undefined);
    const releases = [...new Set(pinned.map((pin) => pin.release as string))].sort(compareReleases);
    // A pin without a group is a group of its own; entries that share a group are alternatives, not drift.
    const groups = new Map<string, Set<string>>();
    for (const pin of pinned) {
      const key = pin.group ?? `${pin.path}\u0000${pin.line}\u0000${pin.source}\u0000${pin.raw}`;
      const alternatives = groups.get(key) ?? new Set<string>();
      alternatives.add(pin.release as string);
      groups.set(key, alternatives);
    }
    let common: Set<string> | undefined;
    for (const alternatives of groups.values()) {
      common = common === undefined ? new Set(alternatives) : new Set([...common].filter((release) => alternatives.has(release)));
    }
    const lowest = releases[0];
    const floorConflicts = lowest === undefined
      ? []
      : pins.filter((pin) => pin.kind === "floor" && pin.release !== undefined && compareReleases(pin.release, lowest) > 0);
    runtimes.push({ runtime: collector.runtime, pins, releases, floorConflicts, drifted: common !== undefined && common.size === 0 });
  }
  runtimes.sort((a, b) => a.runtime.localeCompare(b.runtime));
  return { schemaVersion: "evergreen.drift.v1", runtimes };
}
