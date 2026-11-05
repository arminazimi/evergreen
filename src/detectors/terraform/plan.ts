/**
 * Pure, bounded parser for Terraform plan JSON (`terraform show -json` output).
 *
 * Reads:
 * - `terraform_version` at top-level
 * - `provider_config` inside `configuration` (or top-level)
 * - `engine` and `engine_version` on resources inside `planned_values` or `resource_changes`
 *
 * Malformed JSON, huge inputs, or deeply nested structures return empty declarations
 * without throwing or crashing.
 */

export const MAXIMUM_INPUT_BYTES = 10 * 1024 * 1024; // 10 MiB
const MAXIMUM_DECLARATIONS = 500;
const MAXIMUM_DEPTH = 10;

export interface TerraformPlanCliDeclaration {
  kind: "cli_version";
  value: string;
  pointer: string;
}

export interface TerraformPlanProviderDeclaration {
  kind: "provider_version";
  provider: string;
  source?: string;
  value: string;
  pointer: string;
}

export interface TerraformPlanEngineDeclaration {
  kind: "engine_version";
  resource: string;
  name: string;
  engine: string;
  value: string;
  address: string;
  pointer?: string;
}

export type TerraformPlanDeclaration =
  | TerraformPlanCliDeclaration
  | TerraformPlanProviderDeclaration
  | TerraformPlanEngineDeclaration;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value as a record, or undefined for anything else, so a narrowed read needs no assertion. */
function recordAt(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function extractStringOrNumber(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return String(value);
  }
  return undefined;
}

function collectResourcesFromModule(
  moduleObj: unknown,
  depth: number,
  seenAddresses: Set<string>,
  declarations: TerraformPlanDeclaration[],
): void {
  if (depth > MAXIMUM_DEPTH || !isRecord(moduleObj) || declarations.length >= MAXIMUM_DECLARATIONS) {
    return;
  }

  if (Array.isArray(moduleObj.resources)) {
    for (const res of moduleObj.resources) {
      if (declarations.length >= MAXIMUM_DECLARATIONS) break;
      if (!isRecord(res)) continue;

      const address = typeof res.address === "string" ? res.address : "";
      const type = typeof res.type === "string" ? res.type : "";
      const name = typeof res.name === "string" ? res.name : "";
      const values = isRecord(res.values) ? res.values : undefined;

      if (address && values) {
        const engine = extractStringOrNumber(values.engine);
        const engineVersion = extractStringOrNumber(values.engine_version);
        if (engine && engineVersion && !seenAddresses.has(address)) {
          seenAddresses.add(address);
          declarations.push({
            kind: "engine_version",
            resource: type,
            name,
            engine,
            value: engineVersion,
            address,
            pointer: address,
          });
        }
      }
    }
  }

  if (Array.isArray(moduleObj.child_modules)) {
    for (const child of moduleObj.child_modules) {
      if (declarations.length >= MAXIMUM_DECLARATIONS) break;
      collectResourcesFromModule(child, depth + 1, seenAddresses, declarations);
    }
  }
}

function collectCliVersion(data: Record<string, unknown>, declarations: TerraformPlanDeclaration[]): void {
  const cliVersion = extractStringOrNumber(data.terraform_version);
  if (cliVersion) {
    declarations.push({
      kind: "cli_version",
      value: cliVersion,
      pointer: "/terraform_version",
    });
  }
}

function collectProviderConfigs(
  data: Record<string, unknown>,
  configuration: Record<string, unknown> | undefined,
  declarations: TerraformPlanDeclaration[],
): void {
  const providerConfig = recordAt(configuration?.provider_config) ?? recordAt(data.provider_config);
  if (!providerConfig) {
    return;
  }

  const fromConfiguration = Boolean(configuration?.provider_config);
  for (const [key, config] of Object.entries(providerConfig)) {
    if (declarations.length >= MAXIMUM_DECLARATIONS) break;
    if (!isRecord(config)) continue;

    const constraint = extractStringOrNumber(config.version_constraint) ?? extractStringOrNumber(config.version);
    if (!constraint) continue;

    const providerName = typeof config.name === "string" ? config.name : key.split(".", 1).join();
    const fullName = extractStringOrNumber(config.full_name) ?? extractStringOrNumber(config.source);
    const pointer = fromConfiguration ? `/configuration/provider_config/${key}` : `/provider_config/${key}`;
    declarations.push({
      kind: "provider_version",
      provider: providerName,
      ...(fullName ? { source: fullName } : {}),
      value: constraint,
      pointer,
    });
  }
}

/** The first version constraint of a provider requirement, preferring the `version_constraints` list. */
function requirementConstraint(req: Record<string, unknown>): string | undefined {
  if (Array.isArray(req.version_constraints) && req.version_constraints.length > 0) {
    return extractStringOrNumber(req.version_constraints[0]);
  }
  return extractStringOrNumber(req.version_constraint);
}

/** Adds provider versions from `provider_requirements`, skipping providers already declared. */
function collectProviderRequirements(
  configuration: Record<string, unknown> | undefined,
  declarations: TerraformPlanDeclaration[],
): void {
  const providerRequirements = recordAt(configuration?.provider_requirements);
  if (!providerRequirements) {
    return;
  }

  for (const [key, req] of Object.entries(providerRequirements)) {
    if (declarations.length >= MAXIMUM_DECLARATIONS) break;
    if (!isRecord(req)) continue;

    const constraint = requirementConstraint(req);
    if (!constraint) continue;

    const alreadyDeclared = declarations.some((d) => d.kind === "provider_version" && d.provider === key);
    if (alreadyDeclared) continue;

    const source = extractStringOrNumber(req.source);
    declarations.push({
      kind: "provider_version",
      provider: key,
      ...(source ? { source } : {}),
      value: constraint,
      pointer: `/configuration/provider_requirements/${key}`,
    });
  }
}

/** The engine declaration for one `resource_changes` entry, or undefined when it has none or was already seen. */
function engineFromResourceChange(
  rc: unknown,
  index: number,
  seenAddresses: Set<string>,
): TerraformPlanEngineDeclaration | undefined {
  if (!isRecord(rc)) return undefined;

  const address = typeof rc.address === "string" ? rc.address : "";
  const after = recordAt(recordAt(rc.change)?.after);
  if (!address || !after || seenAddresses.has(address)) return undefined;

  const engine = extractStringOrNumber(after.engine);
  const engineVersion = extractStringOrNumber(after.engine_version);
  if (!engine || !engineVersion) return undefined;

  seenAddresses.add(address);
  return {
    kind: "engine_version",
    resource: typeof rc.type === "string" ? rc.type : "",
    name: typeof rc.name === "string" ? rc.name : "",
    engine,
    value: engineVersion,
    address,
    pointer: `/resource_changes/${index}/change/after`,
  };
}

function collectResourceChanges(
  resourceChanges: unknown[],
  seenAddresses: Set<string>,
  declarations: TerraformPlanDeclaration[],
): void {
  for (let i = 0; i < resourceChanges.length; i++) {
    if (declarations.length >= MAXIMUM_DECLARATIONS) break;
    const declaration = engineFromResourceChange(resourceChanges[i], i, seenAddresses);
    if (declaration) declarations.push(declaration);
  }
}

/** Parse declarations from `terraform show -json` string output. */
export function parseTerraformPlanJson(contents: string): TerraformPlanDeclaration[] {
  if (contents.length > MAXIMUM_INPUT_BYTES) {
    return [];
  }

  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    return [];
  }

  if (!isRecord(data)) {
    return [];
  }

  const declarations: TerraformPlanDeclaration[] = [];
  const configuration = recordAt(data.configuration);

  collectCliVersion(data, declarations);
  collectProviderConfigs(data, configuration, declarations);
  collectProviderRequirements(configuration, declarations);

  // Engine versions from planned_values first, then resource_changes for addresses not seen yet.
  const seenAddresses = new Set<string>();
  const rootModule = recordAt(recordAt(data.planned_values)?.root_module);
  if (rootModule) {
    collectResourcesFromModule(rootModule, 0, seenAddresses, declarations);
  }
  if (Array.isArray(data.resource_changes)) {
    collectResourceChanges(data.resource_changes, seenAddresses, declarations);
  }

  return declarations;
}
