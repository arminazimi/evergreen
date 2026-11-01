---
title: r/devops draft
---

# r/devops

r/devops is a text-first subreddit. Use a self-post, disclose that you maintain
the project, and check the current rules on self-promotion before submitting. The
draft is written for platform and DevOps readers rather than for application
developers.

## Post

- **Subreddit:** r/devops
- **Title:** `Evergreen: offline lifecycle checks for CI, with a baseline and a severity gate`
- **Flair:** use the channel's current tools or projects flair if one is
  required.
- **Media to attach:** `../assets/screenshots/job-summary.webp` and
  `../assets/screenshots/pr-comment.webp`. Reddit does not resolve repository
  relative paths, so upload the files from
  [screenshots.md](screenshots.md) instead of pasting the path.

```markdown
I maintain Evergreen, an open-source CLI that finds end-of-life runtimes,
deprecated packages, and retired GitHub Actions in a repository, and shows the
exact file and line for each one.

The operational problem: a base image, runtime, or Action gets retired, and the
build breaks or a review finds it months later. Update bots tell you that a
newer version exists; they do not tell you which removal affects this
repository, where the affected API is used, or what evidence supports the
claim.

Evergreen scans the checkout locally. It reads manifests, lockfiles, workflow
files, and runtime pins; a scan makes no network requests, needs no token, and
never executes repository code. Each finding carries severity, the location, a
replacement, an authoritative source, and migration context.

For CI:

- The GitHub Action writes annotations, a job summary, an optional pull request
  comment, and optional SARIF for code scanning, then enforces a severity gate.
- The GitLab CI/CD component writes a JSON report and a Code Quality report and
  uses the same gate inputs.
- A baseline accepts existing findings with an owner, reason, and expiry, so the
  gate fires on new findings, not the ones you accepted.
- Output formats include text, JSON, compact, SARIF, HTML, and Code Quality.

A minimal GitHub Actions step:

    - uses: actions/checkout@v7
    - uses: arminazimi/evergreen@v0.7.1
      with:
        baseline: .evergreen-baseline.json
        fail-on-severity: high

Use the current release tag from the repository; v0.7.1 is the version
documented in the Action guide at the time this draft was written.

Run it locally first:

    npx evergreen-deprecation scan .
    npx evergreen-deprecation baseline .

It requires Node.js 22 or newer. Coverage is deliberately uneven and marked in
the compatibility matrix: Node.js, npm, Python, and GitHub Actions are
Supported, while containers, Kubernetes, the JVM, .NET, Go, Rust, Ruby, PHP,
Terraform, and others are Beta or Experimental. A package with no rule is
reported as no-data, not as safe.

It is not a vulnerability scanner and does not replace Renovate or Dependabot.
It does not open migration pull requests or run migration commands. `evergreen
fix` prints deterministic patches, writes only when you ask for a local branch,
and never guesses a deprecation without a published source.

If you run dependency policy across many repositories, what would you need
before putting this in a required check? I am especially interested in
false-positive boundaries, baseline expiry policy, and how you route findings to
owners.

Repository: https://github.com/arminazimi/evergreen
Docs: https://arminazimi.github.io/evergreen/
```

## First comment

Use the first comment for the screenshots and for the limits, so the post stays
readable.

```markdown
Two captures from the GitHub Action, both from the deliberately outdated demo
project:

- Job summary: `../assets/screenshots/job-summary.webp`
- Pull request comment: `../assets/screenshots/pr-comment.webp`

The screenshots show example findings from `examples/demo`, not a real
customer. Counts can differ from a current scan because the bundled rules
change between releases.

Things it intentionally does not do: scan for CVEs, replace an update bot,
change code without an explicit command, or claim coverage of an ecosystem
without a reviewed rule.
```

## Notes

- Lead with the operational problem, not the feature list. The draft does that;
  keep the order.
- If someone asks for a detector for their stack, point at the
  [compatibility matrix](../COMPATIBILITY.md) and ask for the declaration forms
  they actually use. Do not promise a date.
- [VALIDATION.md](../VALIDATION.md) has the public corpus method if the thread
  questions precision.
