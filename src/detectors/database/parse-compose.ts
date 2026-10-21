import { parseCompose } from "../container/parse-compose.js";
import { parseImageReference } from "../container/parse-image.js";

/**
 * Pure, bounded parser for database image tags in Compose files.
 *
 * Reads `services.<name>.image` through the shared Compose parser and keeps
 * only Docker Hub official `postgres`, `mysql`, `mariadb`, `redis`, and `mongo`
 * images that carry a literal tag. Interpolated values (`${DB_IMAGE}`), images
 * without a tag or with only a digest, other registries, lookalike names, keys
 * other than `image`, YAML aliases, and invalid YAML return nothing. The parser
 * never evaluates contents and never executes tools.
 */

export { MAXIMUM_INPUT_BYTES } from "../container/parse-compose.js";

export type DatabaseProduct = "postgres" | "mysql" | "mariadb" | "redis" | "mongo";

const PRODUCTS: ReadonlySet<string> = new Set(["postgres", "mysql", "mariadb", "redis", "mongo"]);

export interface DatabaseImageDeclaration {
  product: DatabaseProduct;
  /** The image tag exactly as written, for example `12` or `5.7-alpine`. */
  value: string;
  /** The 1-based line of the image string. */
  line: number;
}

/** Parse database image tags from a Compose file without file, network, or process I/O. */
export function parseDatabaseCompose(contents: string): DatabaseImageDeclaration[] {
  const declarations: DatabaseImageDeclaration[] = [];
  for (const declaration of parseCompose(contents)) {
    if (declaration.kind !== "image") continue;
    const reference = parseImageReference(declaration.value);
    if (!reference || reference.registry !== "docker.io" || reference.tag === undefined) continue;
    if (!reference.repository.startsWith("library/")) continue;
    const product = reference.repository.slice("library/".length);
    if (!PRODUCTS.has(product)) continue;
    declarations.push({ product: product as DatabaseProduct, value: reference.tag, line: declaration.line });
  }
  return declarations;
}
