---
title: Show HN draft
---

# Show HN

Show HN is for something you have made that other people can try. The title
must start with `Show HN:`, the URL field should point at the repository, and
the text should be plain text. Hacker News does not render Markdown, so copy
everything inside the fenced blocks as-is.

## Submission

- **URL:** `https://github.com/arminazimi/evergreen`
- **Title:** `Show HN: Evergreen – find end-of-life dependencies offline`
- **Text:** copy the block below into the text field. The first paragraph is
  written for the maintainer; adjust it if someone else is posting.

```text
I maintain Evergreen, a local-first CLI that finds end-of-life runtimes,
deprecated packages, and retired GitHub Actions in a repository, and shows the
exact file and line for each one.

The problem I kept running into: update tools tell you a newer version exists,
but not which deprecation or removal will actually break this repository, where
the affected thing is used, or what evidence supports the claim. Evergreen is
built around that question.

What it does:

- Reads manifests, lockfiles, workflow files, and runtime pins.
- Reports severity, exact location, a replacement, and the authoritative source
  behind each finding.
- Produces migration context for a human or coding agent, including affected
  files and suggested verification commands. It never runs those commands.
- Scans locally with no network requests and no account. It parses repository
  files; it never executes them.
- Ships as a CLI, a local MCP server, a GitHub Action, and an Agent Skill.
- Supports a baseline, so existing findings can be accepted with an owner,
  reason, and expiry and CI gates new findings above a severity gate.
- Includes a check command for one package before you add it:
  npx evergreen-deprecation check pkg:npm/request@2.88.2

Try it:

npx evergreen-deprecation scan .

It requires Node.js 22 or newer. Output formats include text, JSON, compact,
SARIF, and a self-contained HTML report.

Coverage is deliberately uneven and documented. Node.js, npm, Python, and GitHub
Actions are Supported; containers, Kubernetes, the JVM, .NET, Go, Rust, Ruby,
PHP, Terraform, Dart and Flutter, serverless, and others are Beta or
Experimental and marked as such. A package with no rule is reported as no-data,
not as safe.

It is not a vulnerability scanner and does not replace Renovate or Dependabot.
It does not run migration commands, and it changes files only when you ask it to
apply a patch. It never guesses a deprecation without a published source.

The public corpus and measured results are in docs/VALIDATION.md, including the
pinned repositories, expected findings, and false-positive and false-negative
counts. I would especially like feedback from people who maintain long-lived
repositories or run dependency policy in CI: which lifecycle risks are you
missing today, and what would make the output trustworthy enough for a gate?

Repository: https://github.com/arminazimi/evergreen
Docs: https://arminazimi.github.io/evergreen/
```

## First comment

Post this as the author's first comment after the submission appears. It adds
implementation detail without repeating the body.

```text
A few implementation notes in case they are useful:

- Detection is deterministic and rule-based. Every lifecycle claim points at an
  authoritative, versioned source; rules live in registry/*.json and are
  reviewed data, not code.
- The scan path makes no network calls. The separate data update command is the
  one command that fetches signed rule updates between releases.
- The CLI, the local MCP tools, and the GitHub Action all use the same scan
  engine, so they report the same kind of finding with the same evidence.
- There is a 90-second demo against a deliberately outdated example in the
  repository: docs/DEMO.md.

Happy to answer questions about detector boundaries, the evidence policy, or
what is still missing.
```

## Notes

- Do not ask for upvotes or coordinate voting. Reply to substantive criticism
  with the specific source or limitation.
- The body names unsupported and experimental areas on purpose. If a comment
  asks about an ecosystem that is not listed, point at
  [COMPATIBILITY.md](../COMPATIBILITY.md) and the `no-data` behavior instead of
  guessing.
- No image is attached. The HTML report and CI screenshots are for
  [newsletters](newsletters.md) and [social](social.md), not for this post.
