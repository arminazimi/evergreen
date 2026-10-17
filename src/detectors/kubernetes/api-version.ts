/**
 * Pure helpers for Kubernetes `apiVersion` values.
 *
 * An `apiVersion` is `<group>/<version>`, or just `<version>` for the core group.
 * Registry rules carry the API version as a `semver` VERS constraint, translated by
 * a fixed rule (decision 0008): `vN` is `N.0.0`, `vNalphaM` is `N.0.0-alpha.M`, and
 * `vNbetaM` is `N.0.0-beta.M`. That keeps Kubernetes' maturity order
 * (alpha, then beta, then stable) without a new VERS scheme.
 */

export interface ApiVersion {
  /** The API group, lower case; empty for the core group. */
  group: string;
  /** The version part, for example `v1beta1`. */
  version: string;
}

const MAXIMUM_API_VERSION_LENGTH = 253 + 1 + 63;
const GROUP = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const VERSION = /^v([1-9]\d{0,5})(?:(alpha|beta)([1-9]\d{0,5}))?$/;
const KIND = /^[A-Za-z][A-Za-z0-9]{0,62}$/;

/** Split a literal `apiVersion` into group and version; undefined when it is not one. */
export function splitApiVersion(value: string): ApiVersion | undefined {
  if (value.length === 0 || value.length > MAXIMUM_API_VERSION_LENGTH) return undefined;
  const slash = value.lastIndexOf("/");
  const group = slash < 0 ? "" : value.slice(0, slash);
  const version = slash < 0 ? value : value.slice(slash + 1);
  if (slash >= 0 && (group.length > 253 || !GROUP.test(group))) return undefined;
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(version)) return undefined;
  return { group, version };
}

/** Whether `value` can be the `kind` of a Kubernetes object. */
export function isKind(value: string): boolean {
  return KIND.test(value);
}

/** Translate an API version (`v1beta1`) to the semver text rules use (`1.0.0-beta.1`). */
export function ruleVersion(version: string): string | undefined {
  const match = VERSION.exec(version);
  if (!match) return undefined;
  const [, major, stage, number] = match;
  return stage ? `${major}.0.0-${stage}.${number}` : `${major}.0.0`;
}
