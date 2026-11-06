import type { DeprecationRule, UsageMatcher } from "../../domain.js";

export interface PythonRuntimeRule extends DeprecationRule {
  kind: "runtime";
  maximumVersion: string;
  /** A line with an announced end that has not happened yet (decision 0010): it names exactly that line, not "and older". */
  scheduled?: boolean;
}

export interface PythonPackageRule extends DeprecationRule {
  kind: "package";
  package: string;
  usage?: UsageMatcher[];
  /** The rule's VERS range. Absent from the detector view, so `loadRules` attaches it from the v2 rule. */
  vers?: string | undefined;
}

export type PythonRule = PythonRuntimeRule | PythonPackageRule;

export interface Declaration {
  path: string;
  line: number;
  value: string;
  kind: "compatibility range" | "pinned runtime";
  identity?: string;
}

export interface DirectDependency {
  name: string;
  path: string;
  line: number;
  constraint: string;
}

export type ResolvedVersions = Map<string, Set<string>>;

/** One Python project: the root, or a uv workspace member. */
export interface ProjectScan {
  directory: string;
  declarations: Declaration[];
  dependencies: Map<string, DirectDependency>;
  resolved: ResolvedVersions;
}

export type UnknownRecord = Record<string, unknown>;
