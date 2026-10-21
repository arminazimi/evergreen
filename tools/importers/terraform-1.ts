import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer, ImporterContext } from "./types.js";

export const TERRAFORM_RELEASES_PAGE = "https://github.com/hashicorp/terraform/releases";
export const TERRAFORM_SUPPORT_POLICY = "https://support.hashicorp.com/hc/en-us/articles/360021185113";
export const releaseUrl = (minor: number) => `https://api.github.com/repos/hashicorp/terraform/releases/tags/v1.${minor}.0`;
const GITHUB_JSON = "application/vnd.github+json";

/** Release lines HashiCorp supports at once: the newest and the one before it. */
export const SUPPORTED_LINES = 2;
/** Safety bound on the probe for the newest 1.x line. */
export const MAXIMUM_MINOR = 200;

interface ReleasePayload {
  tag_name?: unknown;
  published_at?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

interface LineRelease {
  minor: number;
  date: string;
  url: string;
}

async function lineRelease(context: ImporterContext, minor: number): Promise<LineRelease | undefined> {
  const url = releaseUrl(minor);
  let payload: ReleasePayload;
  try {
    payload = await fetchJson<ReleasePayload>(context, url, { accept: GITHUB_JSON });
  } catch (error) {
    if (/HTTP 404/.test((error as Error).message)) return undefined;
    throw error;
  }
  const published = payload.published_at;
  if (
    payload.tag_name !== `v1.${minor}.0` ||
    payload.draft === true ||
    payload.prerelease === true ||
    typeof published !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(published)
  ) {
    return undefined;
  }
  return {
    minor,
    date: published.slice(0, 10),
    url: typeof payload.html_url === "string" ? payload.html_url : `https://github.com/hashicorp/terraform/releases/tag/v1.${minor}.0`,
  };
}

export const terraformCliImporter: Importer = {
  id: "terraform-1",
  ecosystem: "terraform",
  description: "Terraform CLI release lines no longer within the two most recent, dated by the .0 releases on GitHub",
  sources: [
    { title: "hashicorp/terraform releases", url: TERRAFORM_RELEASES_PAGE },
    { title: "HashiCorp Terraform support policy", url: TERRAFORM_SUPPORT_POLICY },
  ],

  async import(context) {
    const releases: LineRelease[] = [];
    for (let minor = 0; minor <= MAXIMUM_MINOR; minor++) {
      const release = await lineRelease(context, minor);
      if (!release) break;
      releases.push(release);
    }

    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const today = isoDate(context.now);
    const supported = releases.filter((_, index) => index >= releases.length - SUPPORTED_LINES);
    const replacement = supported[0] ? `Terraform 1.${supported[0].minor} or later` : undefined;

    for (const [index, release] of releases.entries()) {
      const successor = releases[index + SUPPORTED_LINES];
      if (!successor) continue;
      if (successor.date > today) {
        notes.push(`Skipped Terraform 1.${release.minor}: its end of support (${successor.date}) is in the future.`);
        continue;
      }
      rules.push({
        id: `terraform.cli.end-of-support-1.${release.minor}`,
        ecosystem: "terraform",
        purl: "pkg:generic/terraform",
        vers: `vers:semver/>=1.${release.minor}.0|<1.${release.minor + 1}.0`,
        event: "end-of-support",
        title: `Terraform CLI 1.${release.minor} is no longer a supported release line`,
        summary: `HashiCorp supports the two most recent Terraform release lines. Terraform 1.${release.minor} (first released ${release.date}) stopped being one of them when Terraform 1.${successor.minor} was released on ${successor.date}.`,
        severity: "medium",
        ...(replacement ? { replacement } : {}),
        deadline: successor.date,
        sources: [
          { title: `hashicorp/terraform release v1.${successor.minor}.0`, url: successor.url },
          { title: `hashicorp/terraform release v1.${release.minor}.0`, url: release.url },
          { title: "HashiCorp Terraform support policy", url: TERRAFORM_SUPPORT_POLICY },
        ],
      });
    }

    if (releases.length === 0) notes.push("No Terraform 1.x release found.");
    else notes.push(`Newest release line found: 1.${releases[releases.length - 1]!.minor}. Lines inside the support window are not drafted.`);
    return { rules, notes };
  },
};
