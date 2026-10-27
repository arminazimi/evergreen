/**
 * Lifecycle rules whose packages the OSV importer checks for advisories with no fixed version.
 * Add a row when a reviewed end-of-life or deprecated rule should surface unfixed OSV ids; keep sorted by ruleId.
 */
export interface OsvCandidate {
  /** Lifecycle rule id a finding will carry; stored on the draft as `x-osv.ruleId` for offline joins. */
  readonly ruleId: string;
  /** Stable id under the `osv.` namespace so rule-id prefixes stay unique across registries. */
  readonly osvRuleId: string;
  /** Package name as OSV names it (npm name, PyPI project, …). */
  readonly name: string;
  /** OSV ecosystem string, for example `npm` or `PyPI`. */
  readonly osvEcosystem: string;
  /** Version-less Package URL of the lifecycle rule. */
  readonly purl: string;
  /** VERS scheme that matches the purl type, for example `npm` or `pypi`. */
  readonly versScheme: string;
}

export const OSV_CANDIDATES: readonly OsvCandidate[] = [
  {
    ruleId: "npm.package.request.deprecated",
    osvRuleId: "osv.npm.request",
    name: "request",
    osvEcosystem: "npm",
    purl: "pkg:npm/request",
    versScheme: "npm",
  },
  {
    ruleId: "python.package.pycrypto.obsolete",
    osvRuleId: "osv.pypi.pycrypto",
    name: "pycrypto",
    osvEcosystem: "PyPI",
    purl: "pkg:pypi/pycrypto",
    versScheme: "pypi",
  },
];
