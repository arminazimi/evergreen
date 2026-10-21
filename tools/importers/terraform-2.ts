import { ImporterError } from "./types.js";
import type { Importer } from "./types.js";

export const TERRAFORM_REGISTRY = "https://registry.terraform.io/";

/** Major-version upgrade guides to read, sorted by provider. Keep this small and evidence-driven. */
export const PROVIDER_GUIDES = [
  { provider: "aws", title: "Terraform AWS Provider Version 6 Upgrade Guide", path: "terraform-provider-aws/main/website/docs/guides/version-6-upgrade.html.markdown" },
  { provider: "azurerm", title: "Terraform AzureRM Provider Version 4.0 Upgrade Guide", path: "terraform-provider-azurerm/main/website/docs/guides/4.0-upgrade-guide.html.markdown" },
  { provider: "google", title: "Terraform Google Provider Version 6.0.0 Upgrade Guide", path: "terraform-provider-google/main/website/docs/guides/version_6_upgrade.html.markdown" },
] as const;

export const guideUrl = (path: string) => `https://raw.githubusercontent.com/hashicorp/${path}`;
export const MAXIMUM_GUIDE_BYTES = 512 * 1024;

const LIFECYCLE_WORD = /\b(discontinu\w*|end(?:s|ing)?(?:[- ]of)?[- ](?:support|life)|retire\w*|sunset\w*|shut(?:s|ting)? down)\b/i;
const FULL_DATE = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/;

/** Lines of a guide that state a dated lifecycle event, trimmed for a note. Pure and bounded. */
export function datedStatements(text: string): string[] {
  const statements: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 2000 || !LIFECYCLE_WORD.test(line) || !FULL_DATE.test(line)) continue;
    const plain = line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    statements.push(plain.length > 200 ? `${plain.slice(0, 197)}...` : plain);
  }
  return statements;
}

/**
 * Reads the major-version upgrade guides of the aws, azurerm, and google providers. The guides describe
 * resource and argument changes, not how long a provider version is supported, and a newer major
 * existing is never evidence that an older one is deprecated. So this importer drafts no provider
 * version rule. It reports each dated service-lifecycle statement a guide makes, for a reviewer to
 * use when writing a rule that a detector can actually match.
 */
export const terraformProviderGuidesImporter: Importer = {
  id: "terraform-2",
  ecosystem: "terraform",
  description: "Dated lifecycle statements in the major upgrade guides of the aws, azurerm, and google providers",
  sources: [
    { title: "Terraform Registry", url: TERRAFORM_REGISTRY },
    ...PROVIDER_GUIDES.map((guide) => ({
      title: guide.title,
      url: `https://github.com/hashicorp/${guide.path.replace("/main/", "/blob/main/")}`,
    })),
  ],

  async import(context) {
    const notes: string[] = [];
    for (const guide of PROVIDER_GUIDES) {
      const url = guideUrl(guide.path);
      const text = await context.fetchText(url);
      if (text.length > MAXIMUM_GUIDE_BYTES) {
        throw new ImporterError(`GET ${url} returned more than ${MAXIMUM_GUIDE_BYTES} bytes.`);
      }
      const statements = datedStatements(text);
      if (statements.length === 0) {
        notes.push(`${guide.provider}: ${guide.title} has no dated lifecycle statement.`);
        continue;
      }
      notes.push(`${guide.provider}: ${guide.title} states ${statements.length} dated lifecycle event(s) for services or resources, none for a provider version.`);
      for (const statement of statements) notes.push(`  ${guide.provider}: ${statement}`);
    }
    return { rules: [], notes };
  },
};
