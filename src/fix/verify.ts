import type { Finding, ScanResult, VerificationCommand } from "../domain.js";

/** What a fresh scan says about a fix: which findings it removed, which are still there, and which it introduced. */
export interface FixVerification {
  resolved: Finding[];
  remaining: Finding[];
  introduced: Finding[];
  /** The verification commands the touched rules name. They are printed for the user and never run. */
  commands: VerificationCommand[];
}

/** Compares the scan taken before a fix with a re-scan after it. Findings match by id: a fix edits in place, so ids hold. */
export function verifyFix(before: ScanResult, after: ScanResult): FixVerification {
  const previous = new Set(before.findings.map((finding) => finding.id));
  const current = new Set(after.findings.map((finding) => finding.id));
  const resolved = before.findings.filter((finding) => !current.has(finding.id));
  const remaining = after.findings.filter((finding) => previous.has(finding.id));
  const introduced = after.findings.filter((finding) => !previous.has(finding.id));

  const commands: VerificationCommand[] = [];
  for (const finding of [...resolved, ...remaining, ...introduced]) {
    for (const command of finding.migration?.verification ?? []) {
      if (!commands.some((candidate) => candidate.command === command.command)) commands.push(command);
    }
  }
  return { resolved, remaining, introduced, commands };
}

/** The lines `fix --branch` prints after the commit: the outcome, then the commands to run next. */
export function renderVerification(verification: FixVerification): string {
  const count = (findings: Finding[], word: string): string => `${findings.length} ${word}`;
  const lines = [`Re-scan: ${count(verification.resolved, "resolved")}, ${count(verification.remaining, "remaining")}, ${count(verification.introduced, "new")}.`];
  for (const finding of verification.introduced) lines.push(`  new: ${finding.ruleId} at ${finding.location.path}`);
  if (verification.commands.length > 0) {
    lines.push("Verify the migration yourself; Evergreen did not run these:");
    for (const command of verification.commands) lines.push(`  ${command.command}  # ${command.purpose}`);
  }
  return `${lines.join("\n")}\n`;
}
