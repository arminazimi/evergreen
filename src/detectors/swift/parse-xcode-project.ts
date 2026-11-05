/**
 * Pure, bounded parser for the iOS deployment targets an app target declares in `project.pbxproj`.
 *
 * It reads `IPHONEOS_DEPLOYMENT_TARGET` from the build configurations of native targets whose
 * product type is an application (`com.apple.product-type.application`). Only that product type
 * counts as an App Store app: frameworks, static libraries, extensions, and Swift packages never
 * produce a declaration, so a `platforms:` minimum for a library in `Package.swift` is never read.
 * Only target-level settings are read. A value inherited from the project, a `$(...)` reference, or
 * any non-numeric value is skipped.
 *
 * The parser reads the line-oriented layout Xcode writes (objects at two tabs, fields at three,
 * build settings at four). A file with an object that is never closed, a list that is never
 * closed, or input over the byte bound returns nothing, so it never yields part of a malformed
 * project. An object identifier that appears twice is ambiguous and is not used. The parser never
 * evaluates contents or runs Xcode tooling.
 */

import { required } from "../../required.js";

export const MAXIMUM_PROJECT_BYTES = 16 * 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

/** The product type of an application target, which is the only target kind App Store Connect accepts uploads for. */
const APPLICATION_PRODUCT_TYPE = "com.apple.product-type.application";

/** A deployment target written as a numeric release, such as `12.0` or `13`. */
const NUMERIC_DEPLOYMENT_TARGET = /^[0-9]+(?:\.[0-9]+)*$/;

export interface IOSDeploymentTargetDeclaration {
  /** The deployment target exactly as written, such as `12.0`. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

interface ProjectObject {
  isa?: string;
  productType?: string;
  buildConfigurationList?: string;
  buildConfigurations: string[];
  deploymentTargets: IOSDeploymentTargetDeclaration[];
}

const OBJECT_START = /^\t\t([0-9A-Fa-f]{24})(?: \/\*.*\*\/)? = \{$/;
const OBJECT_END = /^\t\t\};$/;
// A reference field may carry a trailing comment, such as `ID /* Build configuration list for PBXNativeTarget "App" */`.
const FIELD = /^\t\t\t(isa|productType|buildConfigurationList) = "?([^";\s/]*)"?(?: \/\*.*\*\/)?;$/;
const LIST_START = /^\t\t\tbuildConfigurations = \($/;
const LIST_END = /^\t\t\t\);$/;
const LIST_ITEM = /^\t\t\t\t([0-9A-Fa-f]{24})(?: \/\*.*\*\/)?,$/;
const DEPLOYMENT_TARGET = /^\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = "?([^";]*)"?;$/;

/** Every top-level object of the project, keyed by identifier. An identifier that appears twice is dropped as ambiguous. */
export function projectObjects(lines: readonly string[]): Map<string, ProjectObject> {
  const objects = new Map<string, ProjectObject>();
  const ambiguous = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const start = OBJECT_START.exec(required(lines[index], "the object line"));
    if (!start) continue;
    const body = readObjectBody(lines, index + 1);
    if (!body) return new Map();
    index = body.end;

    const identifier = required(start[1], "object identifier");
    if (objects.has(identifier)) ambiguous.add(identifier);
    objects.set(identifier, body.object);
  }

  for (const identifier of ambiguous) objects.delete(identifier);
  return objects;
}

/** Read the body of one object from `from` through its closing line. Undefined when the object, or a list inside it, is never closed. */
function readObjectBody(lines: readonly string[], from: number): { object: ProjectObject; end: number } | undefined {
  const object: ProjectObject = { buildConfigurations: [], deploymentTargets: [] };
  let inList = false;
  for (let index = from; index < lines.length; index += 1) {
    const line = required(lines[index], "the object body line");
    if (OBJECT_END.test(line)) return inList ? undefined : { object, end: index };
    if (inList) {
      if (LIST_END.test(line)) inList = false;
      else addConfigurationItem(object, line);
    } else if (LIST_START.test(line)) {
      inList = true;
    } else {
      readObjectLine(object, line, index + 1);
    }
  }
  return undefined;
}

function addConfigurationItem(object: ProjectObject, line: string): void {
  const item = LIST_ITEM.exec(line);
  if (item) object.buildConfigurations.push(required(item[1], "configuration identifier"));
}

/** Read one field or build setting line of an object body. */
function readObjectLine(object: ProjectObject, line: string, lineNumber: number): void {
  const field = FIELD.exec(line);
  if (field) {
    assignField(object, required(field[1], "field name"), required(field[2], "field value"));
    return;
  }
  const deployment = DEPLOYMENT_TARGET.exec(line);
  if (deployment && line.length <= MAXIMUM_LINE_LENGTH) {
    object.deploymentTargets.push({ value: required(deployment[1], "deployment target"), line: lineNumber });
  }
}

function assignField(object: ProjectObject, name: string, value: string): void {
  if (name === "isa") object.isa = value;
  else if (name === "productType") object.productType = value;
  else object.buildConfigurationList = value;
}

/** The iOS deployment targets set on the build configurations of app targets, in source order. Libraries and other product types are never reported. */
export function parseXcodeProjectIOSDeploymentTargets(contents: string): IOSDeploymentTargetDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_PROJECT_BYTES) return [];

  const lines = contents.split(/\r?\n/);
  const objects = projectObjects(lines);
  const declarations: IOSDeploymentTargetDeclaration[] = [];

  for (const target of objects.values()) {
    if (target.isa !== "PBXNativeTarget" || target.productType !== APPLICATION_PRODUCT_TYPE) continue;
    const configurationList = objects.get(target.buildConfigurationList ?? "");
    if (configurationList?.isa !== "XCConfigurationList") continue;

    for (const identifier of configurationList.buildConfigurations) {
      const configuration = objects.get(identifier);
      if (configuration?.isa !== "XCBuildConfiguration") continue;
      for (const declaration of configuration.deploymentTargets) {
        if (NUMERIC_DEPLOYMENT_TARGET.test(declaration.value)) declarations.push(declaration);
      }
    }
  }

  return declarations.sort((left, right) => left.line - right.line);
}
