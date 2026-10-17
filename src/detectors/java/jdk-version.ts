/**
 * Pure helpers for JDK versions and the declarations the Java parsers return.
 *
 * A JDK is identified by its feature release (`17`, `22`). Legacy `1.N` means release `N`, a vendor prefix
 * (`temurin-`) or SDKMAN suffix (`-tem`) is ignored, and the vendor is never used to decide support
 * (decision 0009). Registry rules carry the feature release as `N.0.0` on the `semver` VERS scheme.
 */

/** What a JDK declaration names: the JDK itself, or only the language level code is compiled for. */
export type JdkRole = "toolchain" | "pin" | "compile-level";

export interface JdkDeclaration {
  kind: "jdk";
  role: JdkRole;
  /** The text as written, for example `1.8` or `18.0.2-tem`. */
  value: string;
  /** The JDK feature release, for example `8` for `1.8`. */
  major: number;
  line: number;
}

/** A JDK declaration whose value cannot be known without running something. */
export interface DynamicJdkDeclaration {
  kind: "dynamic";
  role: JdkRole;
  value: string;
  line: number;
}

export interface DependencyDeclaration {
  kind: "dependency";
  group: string;
  artifact: string;
  version: string;
  line: number;
}

/** The version of a Kotlin Gradle plugin; evidence only, no rule judges it yet. */
export interface KotlinPluginDeclaration {
  kind: "kotlin-plugin";
  value: string;
  line: number;
}

export interface JdkVersion {
  major: number;
}

const MAXIMUM_MAJOR = 99;
const VENDOR_PREFIX = /^(?:[A-Za-z][A-Za-z0-9_]*-)+(?=\d)/;
const VERSION = /^(\d+)(?:\.(\d+))?(?:\.\d+)*(?:[._+-][A-Za-z0-9._+-]*)?$/;
const FLOATING = /^(?:latest|system|lts|default)$/i;

/** The feature release of a JDK version text, or undefined when it does not name one. */
export function parseJdkVersion(text: string): JdkVersion | undefined {
  const value = text.trim().replace(VENDOR_PREFIX, "");
  if (value.length === 0 || value.length > 64) return undefined;
  const match = VERSION.exec(value);
  if (!match) return undefined;
  let major = Number(match[1]);
  if (major === 1) {
    if (match[2] === undefined) return undefined;
    major = Number(match[2]);
  }
  return major >= 5 && major <= MAXIMUM_MAJOR ? { major } : undefined;
}

/** Whether a version text is a reference to something the parser does not expand. */
export function isDynamicVersion(text: string): boolean {
  const value = text.trim();
  return value.includes("${") || value.includes("$(") || FLOATING.test(value);
}

/** The rule version text for a JDK feature release (`22` becomes `22.0.0`). */
export function jdkRuleVersion(major: number): string {
  return `${major}.0.0`;
}

/** A declaration for a version text: literal, dynamic, or nothing when it is neither. */
export function jdkDeclaration(role: JdkRole, text: string, line: number): JdkDeclaration | DynamicJdkDeclaration | undefined {
  const value = text.trim();
  if (isDynamicVersion(value)) return { kind: "dynamic", role, value, line };
  const parsed = parseJdkVersion(value);
  return parsed ? { kind: "jdk", role, value, major: parsed.major, line } : undefined;
}
