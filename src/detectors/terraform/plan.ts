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

  // 1. Top-level CLI version
  const cliVersion = extractStringOrNumber(data.terraform_version);
  if (cliVersion) {
    declarations.push({
      kind: "cli_version",
      value: cliVersion,
      pointer: "/terraform_version",
    });
  }

  // 2. Provider configurations
  const configuration = isRecord(data.configuration) ? data.configuration : undefined;
  const providerConfig = isRecord(configuration?.provider_config)
    ? (configuration!.provider_config as Record<string, unknown>)
    : isRecord(data.provider_config)
      ? (data.provider_config as Record<string, unknown>)
      : undefined;

  if (providerConfig) {
    for (const [key, config] of Object.entries(providerConfig)) {
      if (declarations.length >= MAXIMUM_DECLARATIONS) break;
      if (!isRecord(config)) continue;

      const providerName = typeof config.name === "string" ? config.name : key.split(".")[0]!;
      const fullName = extractStringOrNumber(config.full_name) ?? extractStringOrNumber(config.source);
      const constraint =
        extractStringOrNumber(config.version_constraint) ??
        extractStringOrNumber(config.version);

      if (constraint) {
        const pointer = configuration?.provider_config
          ? `/configuration/provider_config/${key}`
          : `/provider_config/${key}`;
        declarations.push({
          kind: "provider_version",
          provider: providerName,
          ...(fullName ? { source: fullName } : {}),
          value: constraint,
          pointer,
        });
      }
    }
  }

  // Also check configuration.provider_requirements if provider_config didn't yield provider versions
  if (isRecord(configuration?.provider_requirements)) {
    for (const [key, req] of Object.entries(configuration!.provider_requirements as Record<string, unknown>)) {
      if (declarations.length >= MAXIMUM_DECLARATIONS) break;
      if (!isRecord(req)) continue;

      const source = extractStringOrNumber(req.source);
      let constraint: string | undefined;
      if (Array.isArray(req.version_constraints) && req.version_constraints.length > 0) {
        constraint = extractStringOrNumber(req.version_constraints[0]);
      } else {
        constraint = extractStringOrNumber(req.version_constraint);
      }

      if (constraint) {
        const pointer = `/configuration/provider_requirements/${key}`;
        // Only add if not already added from provider_config
        const exists = declarations.some(
          (d) => d.kind === "provider_version" && d.provider === key,
        );
        if (!exists) {
          declarations.push({
            kind: "provider_version",
            provider: key,
            ...(source ? { source } : {}),
            value: constraint,
            pointer,
          });
        }
      }
    }
  }

  // 3. Engine versions from planned_values and resource_changes
  const seenAddresses = new Set<string>();

  if (isRecord(data.planned_values) && isRecord(data.planned_values.root_module)) {
    collectResourcesFromModule(data.planned_values.root_module, 0, seenAddresses, declarations);
  }

  if (Array.isArray(data.resource_changes)) {
    for (let i = 0; i < data.resource_changes.length; i++) {
      if (declarations.length >= MAXIMUM_DECLARATIONS) break;
      const rc = data.resource_changes[i];
      if (!isRecord(rc)) continue;

      const address = typeof rc.address === "string" ? rc.address : "";
      const type = typeof rc.type === "string" ? rc.type : "";
      const name = typeof rc.name === "string" ? rc.name : "";
      const change = isRecord(rc.change) ? rc.change : undefined;

      if (address && change && !seenAddresses.has(address)) {
        const after = isRecord(change.after) ? change.after : undefined;
        if (after) {
          const engine = extractStringOrNumber(after.engine);
          const engineVersion = extractStringOrNumber(after.engine_version);
          if (engine && engineVersion) {
            seenAddresses.add(address);
            declarations.push({
              kind: "engine_version",
              resource: type,
              name,
              engine,
              value: engineVersion,
              address,
              pointer: `/resource_changes/${i}/change/after`,
            });
          }
        }
      }
    }
  }

  return declarations;
}
