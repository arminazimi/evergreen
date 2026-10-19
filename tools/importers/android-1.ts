import { isoDate } from "./canonical.js";
import type { DraftRule, Importer } from "./types.js";

export const TARGET_SDK_URL = "https://developer.android.com/google/play/requirements/target-sdk";
const SOURCE = { title: "Meet Google Play's target API level requirement", url: TARGET_SDK_URL };
const TARGET_SDK_PURL = "pkg:generic/android/targetSdk";

const MONTHS: Record<string, string> = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

type Audience = "new-apps-and-updates" | "existing-apps";
type FormFactor = "default" | "wear" | "automotive" | "tv" | "xr";

interface Requirement {
  id: string;
  audience: Audience;
  formFactors: FormFactor[];
  /** Exclusive upper bound on targetSdk (API level). */
  below: number;
  /** Floor the source says apps must meet. */
  minApi: number;
  /** Exact phrase from the page this draft rests on. */
  quote: string;
}

/**
 * Remove `<script>` / `<style>` blocks with a linear scan. A missing closer drops the rest of the
 * document so pathological markup cannot quadratic-backtrack the way a `/[\s\S]*?<\/script>/` regex can.
 */
function stripTagBlocks(html: string, tag: "script" | "style"): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const lower = html.toLowerCase();
  let out = "";
  let cursor = 0;
  while (cursor < html.length) {
    const openAt = lower.indexOf(open, cursor);
    if (openAt === -1) {
      out += html.slice(cursor);
      break;
    }
    const afterName = openAt + open.length;
    const boundary = html[afterName];
    // Require the same `\b` the old regex used: not `<scripted` / `<stylesheet`.
    if (boundary !== undefined && boundary !== ">" && boundary !== "/" && !/\s/.test(boundary)) {
      out += html.slice(cursor, afterName);
      cursor = afterName;
      continue;
    }
    out += html.slice(cursor, openAt);
    const openEnd = html.indexOf(">", afterName);
    if (openEnd === -1) {
      break;
    }
    const closeAt = lower.indexOf(close, openEnd + 1);
    if (closeAt === -1) {
      break;
    }
    out += " ";
    cursor = closeAt + close.length;
  }
  return out;
}

/** Strip markup and normalize entities/typography so requirement regexes see plain ASCII text. */
function pageText(html: string): string {
  const stripped = stripTagBlocks(stripTagBlocks(html, "script"), "style").replace(/<[^>]+>/g, " ");
  const decoded = stripped
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&ndash;/gi, "-")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u00A0/g, " ");
  return decoded.replace(/\s+/g, " ").trim();
}

function toIso(month: string, day: string, year: string): string | undefined {
  const mm = MONTHS[month];
  if (!mm) return undefined;
  const dd = day.padStart(2, "0");
  const value = `${year}-${mm}-${dd}`;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(mm) && date.getUTCDate() === Number(day)
    ? value
    : undefined;
}

function parseDeadline(text: string): string | undefined {
  const match = /Starting (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}) (\d{4}):/.exec(text);
  return match ? toIso(match[1]!, match[2]!, match[3]!) : undefined;
}

function parseExtension(text: string): string | undefined {
  const match = /extension to (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/.exec(text);
  return match ? toIso(match[1]!, match[2]!, match[3]!) : undefined;
}

/**
 * Form-factor floors stated on the target API page. Each draft carries `x-android.formFactors` so a
 * later detector can avoid the false positives that a single below-N rule produces for Wear, TV,
 * Automotive, XR, and non-Play distribution.
 */
function requirements(text: string): { found: Requirement[]; notes: string[] } | undefined {
  const newApps =
    /New apps and app updates must target Android \d+ \(API level (\d+)\) or higher to be submitted to Google Play; except for Wear OS and Android Automotive OS apps, which must target Android \d+ \(API level (\d+)\) or higher, and Android TV and Android XR apps, which must target Android \d+ \(API level (\d+)\) or higher\./.exec(
      text,
    );
  const existing =
    /Existing apps must target Android \d+ \(API level (\d+)\) or higher to remain available to new users on devices running Android OS higher than your app's target API level\. Apps that target Android \d+ \(API level (\d+)\) or lower, including Android \d+ \(API level (\d+)\) or lower for Wear OS, Android TV, and Android XR, and Android \d+ \(API level (\d+)\) or lower for Android Automotive OS,/.exec(
      text,
    );
  if (!newApps || !existing) return undefined;

  const defaultNew = Number(newApps[1]);
  const wearAutoNew = Number(newApps[2]);
  const tvXrNew = Number(newApps[3]);
  const defaultExisting = Number(existing[1]);
  const wearTvXrExistingCeiling = Number(existing[3]); // "API level N or lower" → floor is N+1
  const automotiveExistingCeiling = Number(existing[4]);

  const notes: string[] = [];
  if (Number(existing[2]) !== defaultExisting - 1) {
    notes.push(
      `Existing-apps default floor is API ${defaultExisting}, but the "API level ${existing[2]} or lower" clause does not sit immediately below it; drafts still use the stated floor.`,
    );
  }

  const found: Requirement[] = [
    {
      id: `android.target-sdk.new-apps.default-below-${defaultNew}`,
      audience: "new-apps-and-updates",
      formFactors: ["default"],
      below: defaultNew,
      minApi: defaultNew,
      quote: newApps[0],
    },
    {
      id: `android.target-sdk.new-apps.wear-automotive-below-${wearAutoNew}`,
      audience: "new-apps-and-updates",
      formFactors: ["wear", "automotive"],
      below: wearAutoNew,
      minApi: wearAutoNew,
      quote: newApps[0],
    },
    {
      id: `android.target-sdk.new-apps.tv-xr-below-${tvXrNew}`,
      audience: "new-apps-and-updates",
      formFactors: ["tv", "xr"],
      below: tvXrNew,
      minApi: tvXrNew,
      quote: newApps[0],
    },
    {
      id: `android.target-sdk.existing.default-below-${defaultExisting}`,
      audience: "existing-apps",
      formFactors: ["default"],
      below: defaultExisting,
      minApi: defaultExisting,
      quote: existing[0],
    },
    {
      id: `android.target-sdk.existing.wear-tv-xr-below-${wearTvXrExistingCeiling + 1}`,
      audience: "existing-apps",
      formFactors: ["wear", "tv", "xr"],
      below: wearTvXrExistingCeiling + 1,
      minApi: wearTvXrExistingCeiling + 1,
      quote: existing[0],
    },
    {
      id: `android.target-sdk.existing.automotive-below-${automotiveExistingCeiling + 1}`,
      audience: "existing-apps",
      formFactors: ["automotive"],
      below: automotiveExistingCeiling + 1,
      minApi: automotiveExistingCeiling + 1,
      quote: existing[0],
    },
  ];
  return { found, notes };
}

function formFactorLabel(factors: FormFactor[]): string {
  if (factors.length === 1 && factors[0] === "default") return "default (phone and tablet) apps";
  const names: Record<FormFactor, string> = {
    default: "default",
    wear: "Wear OS",
    automotive: "Android Automotive OS",
    tv: "Android TV",
    xr: "Android XR",
  };
  const labeled = factors.map((factor) => names[factor]);
  if (labeled.length === 1) return `${labeled[0]} apps`;
  if (labeled.length === 2) return `${labeled[0]} and ${labeled[1]} apps`;
  return `${labeled.slice(0, -1).join(", ")}, and ${labeled.at(-1)} apps`;
}

function draft(requirement: Requirement, deadline: string, today: string, extension: string | undefined): DraftRule {
  const scheduled = deadline > today;
  const audienceLabel =
    requirement.audience === "new-apps-and-updates"
      ? "new apps and app updates"
      : "existing apps (availability to new users on newer OS versions)";
  const extensionSentence = extension
    ? ` The same page says an extension to ${extension} may be requested.`
    : "";
  return {
    id: requirement.id,
    ecosystem: "android",
    purl: TARGET_SDK_PURL,
    vers: `vers:intdot/<${requirement.below}`,
    event: scheduled ? "scheduled-end-of-life" : "end-of-support",
    title: scheduled
      ? `Google Play targetSdk below ${requirement.minApi} for ${formFactorLabel(requirement.formFactors)} reaches its requirement date on ${deadline}`
      : `Google Play requires targetSdk ${requirement.minApi}+ for ${formFactorLabel(requirement.formFactors)} (${audienceLabel})`,
    summary:
      `The Google Play target API level requirement page states, starting ${deadline}: ${requirement.quote}` +
      extensionSentence,
    severity: scheduled ? "low" : "high",
    replacement: `targetSdk ${requirement.minApi} or higher (${audienceLabel}; ${formFactorLabel(requirement.formFactors)})`,
    deadline,
    sources: [SOURCE],
    "x-android": {
      declaration: "targetSdk",
      audience: requirement.audience,
      formFactors: requirement.formFactors,
      minApiLevel: requirement.minApi,
    },
  };
}

export const androidTargetSdkImporter: Importer = {
  id: "android-1",
  ecosystem: "android",
  description: "Google Play target API level floors by form factor, from the target SDK requirements page",
  sources: [SOURCE],

  async import(context) {
    const text = pageText(await context.fetchText(TARGET_SDK_URL, { accept: "text/html" }));
    const deadline = parseDeadline(text);
    if (!deadline) {
      return { rules: [], notes: ["No usable 'Starting <date>:' requirement block was found on the target API page."] };
    }

    const parsed = requirements(text);
    if (!parsed) {
      return {
        rules: [],
        notes: [
          "The starting-date block was found, but the new-apps or existing-apps form-factor sentences did not match the expected wording.",
        ],
      };
    }

    const today = isoDate(context.now);
    const extension = parseExtension(text);
    const notes = [
      ...parsed.notes,
      "Drafts set x-android.formFactors so a detector can skip false positives for Wear OS, Android Automotive OS, Android TV, Android XR, and non-Play distribution; form factor is not readable from targetSdk alone.",
      "These requirements apply to apps distributed through Google Play; permanently private / internal-only apps are listed as an exception on the source page.",
    ];
    if (extension) notes.push(`Source offers an extension deadline of ${extension}.`);
    else notes.push("No extension deadline sentence was found on the page.");

    return {
      rules: parsed.found.map((requirement) => draft(requirement, deadline, today, extension)),
      notes,
    };
  },
};
