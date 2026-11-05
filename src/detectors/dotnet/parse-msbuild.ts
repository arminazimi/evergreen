import { readXml, walk } from "./msbuild-xml.js";
import { required } from "../../required.js";
import type { XmlAttribute, XmlElement } from "./msbuild-xml.js";

/**
 * Pure, bounded parser for the declarations in MSBuild files: project files (`*.csproj`, `*.fsproj`,
 * `*.vbproj`), `Directory.Build.props`, and `Directory.Packages.props`.
 *
 * Read: `TargetFramework` and `TargetFrameworks` (a semicolon list, one declaration per entry) in a
 * `PropertyGroup`; `PackageReference` and `PackageVersion` items in an `ItemGroup`, with the version from the
 * `Version` attribute or a `<Version>` child; and whether `ManagePackageVersionsCentrally` is `true`.
 *
 * Values are returned as written. Deciding that `$(Tfm)`, `1.*`, or `[1.0,2.0)` is dynamic is for the caller.
 * Anything under an element, or inside a group, that has a `Condition` is skipped, because it cannot be decided
 * without evaluating MSBuild. `Update` and `Remove` items, `VersionOverride`, and `<Import>` are not read.
 * Malformed XML returns nothing. Nothing is evaluated and `dotnet` is never run.
 */

export interface TargetDeclaration {
  /** One target framework moniker as written, such as `net6.0`. */
  value: string;
  /** The 1-based line of the element holding it. */
  line: number;
}

export interface PackageDeclaration {
  kind: "reference" | "version";
  name: string;
  /** The version as written; absent when the item has none (central package management). */
  version?: string;
  /** The 1-based line of the version, or of the item when it has none. */
  line: number;
}

export interface MsbuildDeclarations {
  targets: TargetDeclaration[];
  packages: PackageDeclaration[];
  /** `ManagePackageVersionsCentrally` is literally `true`. */
  centralPackageManagement: boolean;
}

function conditioned(element: XmlElement): boolean {
  for (let current: XmlElement | undefined = element; current; current = current.parent) {
    if (current.attributes.has("condition")) return true;
  }
  return false;
}

const named = (element: XmlElement, name: string): boolean => element.name.toLowerCase() === name;

function emptyDeclarations(): MsbuildDeclarations {
  return { targets: [], packages: [], centralPackageManagement: false };
}

/** A `PropertyGroup` child: the target frameworks, or the central-management switch. */
function readProperty(element: XmlElement, declarations: MsbuildDeclarations): void {
  if (named(element, "targetframework") || named(element, "targetframeworks")) {
    for (const part of element.text.split(";")) {
      if (part.trim() !== "") declarations.targets.push({ value: part.trim(), line: element.line });
    }
  } else if (named(element, "managepackageversionscentrally") && element.text.toLowerCase() === "true") {
    declarations.centralPackageManagement = true;
  }
}

/** The line of the version: its attribute, its child element, or, when the item has none, the item itself. */
function versionLine(
  element: XmlElement,
  version: string | undefined,
  attribute: XmlAttribute | undefined,
  child: XmlElement | undefined,
): number {
  if (!version) return element.line;
  if (attribute?.value.trim()) return attribute.line;
  return required(child, "version child").line;
}

/** A `PackageReference` or `PackageVersion` item in an `ItemGroup`; an item without an `Include` is ignored. */
function readPackage(element: XmlElement, declarations: MsbuildDeclarations): void {
  const name = element.attributes.get("include")?.value.trim();
  if (!name) return;
  const attribute = element.attributes.get("version");
  const child = element.children.find(
    (candidate) => named(candidate, "version") && !candidate.attributes.has("condition"),
  );
  const version = attribute?.value.trim() || child?.text;
  declarations.packages.push({
    kind: named(element, "packagereference") ? "reference" : "version",
    name,
    ...(version ? { version } : {}),
    line: versionLine(element, version, attribute, child),
  });
}

export function parseMsbuild(contents: string): MsbuildDeclarations {
  const declarations = emptyDeclarations();
  const root = readXml(contents);
  if (!root || !named(root, "project")) return declarations;

  for (const element of walk(root)) {
    const parent = element.parent;
    if (!parent || conditioned(element)) continue;
    if (named(parent, "propertygroup")) readProperty(element, declarations);
    else if (named(parent, "itemgroup") && (named(element, "packagereference") || named(element, "packageversion")))
      readPackage(element, declarations);
  }
  return declarations;
}
