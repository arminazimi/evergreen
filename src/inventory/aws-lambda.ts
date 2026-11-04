import type { InventoryImporter, InventoryItem } from "./types.js";

/**
 * AWS Lambda functions from `aws lambda list-functions --output json`.
 *
 * The export is one page (`{ "Functions": [...] }`), or an array of pages when the command printed every page. Each
 * function is read for `FunctionName` and `Runtime`; container-image functions (`PackageType: "Image"`) have no
 * runtime and are skipped. Nothing but the function's own name and runtime is copied into an item: never the ARN,
 * role, environment variables, or account id. Nothing here calls AWS.
 */

const AWS_LAMBDA_PURL_PREFIX = "pkg:generic/aws-lambda-runtime/";
const RUNTIME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMPORTER_ID = "aws-lambda";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One page: an object whose `Functions` entries all name a function. */
function isPage(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Array.isArray(value.Functions) &&
    value.Functions.every((entry) => isRecord(entry) && typeof entry.FunctionName === "string")
  );
}

/** The pages of the document, with the JSON Pointer prefix each page's values sit under. */
function pages(document: unknown): Array<{ page: Record<string, unknown>; prefix: string }> {
  if (isPage(document)) return [{ page: document, prefix: "" }];
  if (Array.isArray(document) && document.length > 0 && document.every(isPage)) {
    return document.map((page, index) => ({ page: page as Record<string, unknown>, prefix: `/${index}` }));
  }
  return [];
}

export const awsLambdaImporter: InventoryImporter = {
  id: IMPORTER_ID,
  registries: ["serverless"],

  detect(document: unknown): boolean {
    return pages(document).length > 0;
  },

  items(document: unknown, file: string): InventoryItem[] {
    const items: InventoryItem[] = [];
    for (const { page, prefix } of pages(document)) {
      (page.Functions as unknown[]).forEach((entry, index) => {
        if (!isRecord(entry)) return;
        const name = entry.FunctionName;
        if (typeof name !== "string" || name === "") return;
        if (entry.PackageType === "Image") return;
        const runtime = entry.Runtime;
        if (typeof runtime !== "string" || !RUNTIME.test(runtime)) return;
        items.push({
          importer: IMPORTER_ID,
          file,
          pointer: `${prefix}/Functions/${index}/Runtime`,
          resource: name,
          purl: `${AWS_LAMBDA_PURL_PREFIX}${runtime}`,
          version: runtime,
        });
      });
    }
    return items;
  },
};
