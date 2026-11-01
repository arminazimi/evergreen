---
title: Newsletter drafts
---

# Newsletters

Three lengths for editors, plus subject lines and a one-line listing entry.
Send the shortest version that fits the newsletter's format, and include the
link to the repository rather than an attachment. Check the newsletter's
published submission address and rules first.

## Subject lines

- `Evergreen: find what is about to stop working`
- `Offline lifecycle checks for runtimes, packages, and Actions`
- `Know what breaks next, before the upgrade`

**Preheader:** Local-first deprecation intelligence for repositories and CI.

## 50-word blurb

```text
Evergreen is a local-first CLI that finds end-of-life runtimes, deprecated
packages, and retired GitHub Actions at the exact file and line. Each finding
includes severity, a replacement, and an authoritative source. Scans run
offline, need no account, and never execute repository code. Try it with
`npx evergreen-deprecation scan .`
```

## 100-word blurb

```text
Evergreen is a local-first CLI that finds end-of-life runtimes, deprecated
packages, and retired GitHub Actions in a repository, and shows the exact file
and line for each one. Every finding carries severity, a replacement, an
authoritative source, and migration context for a human or coding agent. Scans
make no network requests, need no account, and never execute repository code.

It runs as a CLI, a local MCP server, a GitHub Action, and an Agent Skill. A
baseline accepts known findings with an owner, reason, and expiry, so CI gates
new findings rather than accepted ones. Start with
`npx evergreen-deprecation scan .`
```

## 200-word blurb

```text
Evergreen is a local-first CLI that finds end-of-life runtimes, deprecated
packages, and retired GitHub Actions in a repository, and shows the exact file
and line for each one.

Update tools answer whether a newer version exists. Evergreen answers a
different question: what in this repository is about to stop working, where is
it used, and what evidence says so? Each finding carries severity, a
replacement, the authoritative source behind the claim, and migration context
for a human or coding agent. It suggests verification commands and never runs
them.

Scans read manifests, lockfiles, workflow files, and runtime pins. They make no
network requests, need no account, and never execute repository code. The same
findings feed the CLI, a local MCP server, a GitHub Action, and an Agent Skill.

CI integrations include annotations, a job summary, an optional pull request
comment, optional SARIF for code scanning, and a severity gate. A baseline
accepts existing findings with an owner, reason, and expiry, so the gate fires
on new findings, not the ones you accepted.

Coverage is deliberately uneven and documented; Node.js, npm, Python, and GitHub
Actions are Supported, and the other listed detectors are Beta or Experimental.
A package with no rule reports `no-data`, not safe. Evergreen is not a
vulnerability scanner and does not replace Renovate or Dependabot.

Try it with `npx evergreen-deprecation scan .` on Node.js 22 or newer.
```

## One-line listing entry

```text
Evergreen - local-first deprecation intelligence for software repositories: end-of-life runtimes, deprecated packages, and retired GitHub Actions with exact locations and sources. https://github.com/arminazimi/evergreen
```

## Media

Offer one image, not a gallery. All paths are relative to this file and point at
existing documentation assets.

- HTML report, best for a general developer audience:
  `../assets/screenshots/html-report.webp`
- Findings treemap, best for a visual or data-oriented issue:
  `../assets/screenshots/treemap.webp`
- GitHub Actions job summary, best for a DevOps or platform audience:
  `../assets/screenshots/job-summary.webp`
- Pull request comment, best alongside the job summary:
  `../assets/screenshots/pr-comment.webp`

Use the alt text in [screenshots.md](screenshots.md). If the newsletter requires
PNG or JPEG, convert the WebP without changing what it shows.

## Where to send it

Newsletters that cover DevOps, platform engineering, Node.js, Python, or
open-source developer tooling are the best fit. Use each newsletter's published
submission form or editor address and follow its formatting rules. Do not send
to purchased lists, and do not send the same pitch to several editors at the
same publication.

## Notes

- Do not add subscriber counts, download counts, or "featured" claims. None are
  needed, and the project does not publish user counts.
- Keep the `no-data` sentence. It prevents the blurb from implying complete
  coverage.
- The 200-word blurb names the limits on purpose. Editors can cut the last two
  paragraphs if they need a shorter item, but should keep the local-first and
  evidence claims together.
