import { readXml, walk } from "./msbuild-xml.js";
import type { XmlElement } from "./msbuild-xml.js";

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

const EMPTY: MsbuildDeclarations = { targets: [], packages: [], centralPackageManagement: false };

function conditioned(element: XmlElement): boolean {
  for (let current: XmlElement | undefined = element; current; current = current.parent) {
    if (current.attributes.has("condition")) return true;
  }
  return false;
}

const named = (element: XmlElement, name: string): boolean => element.name.toLowerCase() === name;

export function parseMsbuild(contents: string): MsbuildDeclarations {
  const root = readXml(contents);
  if (!root || !named(root, "project")) return { ...EMPTY, targets: [], packages: [] };
  const declarations: MsbuildDeclarations = { targets: [], packages: [], centralPackageManagement: false };

  for (const element of walk(root)) {
    const parent = element.parent;
    if (!parent || conditioned(element)) continue;
    if (named(parent, "propertygroup")) {
      if (named(element, "targetframework") || named(element, "targetframeworks")) {
        for (const part of element.text.split(";")) {
          if (part.trim() !== "") declarations.targets.push({ value: part.trim(), line: element.line });
        }
      } else if (named(element, "managepackageversionscentrally") && element.text.toLowerCase() === "true") {
        declarations.centralPackageManagement = true;
      }
    } else if (named(parent, "itemgroup") && (named(element, "packagereference") || named(element, "packageversion"))) {
      const name = element.attributes.get("include")?.value.trim();
      if (!name) continue;
      const attribute = element.attributes.get("version");
      const child = element.children.find((candidate) => named(candidate, "version") && !candidate.attributes.has("condition"));
      const version = attribute?.value.trim() || child?.text;
      declarations.packages.push({
        kind: named(element, "packagereference") ? "reference" : "version",
        name,
        ...(version ? { version } : {}),
        line: version ? (attribute?.value.trim() ? attribute.line : child!.line) : element.line,
      });
    }
  }
  return declarations;
}
