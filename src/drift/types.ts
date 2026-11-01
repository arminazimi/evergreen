/** One place a repository states a runtime version, exactly as written. */
export interface RuntimePin {
  /** Repository-relative path with forward slashes. */
  path: string;
  /** 1-based line of the value. */
  line: number;
  /** The file or field the value comes from, such as `.nvmrc` or `Dockerfile FROM`. */
  source: string;
  /** The value as written, such as `lts/hydrogen`, `18.19.0`, or `>=18`. */
  raw: string;
  /** `pin` selects the version that builds or runs; `floor` is a minimum the project supports. */
  kind: "pin" | "floor";
  /** Pins that share a group are alternatives, such as the entries of one multi-target list. They are reported but not compared with each other. */
  group?: string;
  /** The release line the value resolves to offline, such as `18` or `3.11`; absent when it cannot be resolved. */
  release?: string;
  /** Why `release` is absent, in one sentence. */
  unresolved?: string;
  /** The repository directory the value applies to, `.` for the root; absent when it applies repository-wide. A floor is checked only against the pins that apply to its directory. */
  scope?: string;
}

/** Reads the pins for one runtime. Reads repository files only: no network, no commands. */
export interface DriftCollector {
  /** Runtime id, matching the ecosystem id in `src/capabilities.ts` where one exists. */
  runtime: string;
  collect(root: string): Promise<RuntimePin[]>;
  /** Returns the full replacement text of `pin`'s line so it selects `release`, or undefined to refuse. */
  align?(pin: RuntimePin, lineText: string, release: string): string | undefined;
}

export interface RuntimeDrift {
  runtime: string;
  pins: RuntimePin[];
  /** Distinct releases among `pin` values, sorted ascending. */
  releases: string[];
  /** True when no release is selected by every group of alternatives. */
  drifted: boolean;
  /** Floors above the lowest pinned release, which that pinned environment cannot satisfy. */
  floorConflicts: RuntimePin[];
}

export interface DriftReport {
  schemaVersion: "evergreen.drift.v1";
  runtimes: RuntimeDrift[];
}
