# Contributing to Evergreen

Thanks for helping make software lifecycle changes easier to discover and migrate. You can go from picking an issue to opening a pull request in about 30 minutes; this guide shows how.

Coding agents, and people working with them, should also read [AGENTS.md](AGENTS.md). Questions and ideas go to [GitHub Discussions](https://github.com/arminazimi/evergreen/discussions).

## Five-minute path to your first pull request

You need Node.js 22 or newer, git, and a GitHub account. The details for each step are in the sections below.

1. **Fork and clone.**

   ```bash
   git clone https://github.com/<your-account>/evergreen.git
   cd evergreen
   ```

2. **Install and confirm the baseline.**

   ```bash
   npm ci
   npm run check
   ```

   The check must pass before you change anything. If it fails on a clean clone, open a bug report.

3. **Pick a `good first issue` and comment to claim it.** Browse [the open good first issues](https://github.com/arminazimi/evergreen/issues?q=is%3Aopen+label%3A%22good+first+issue%22), choose one whose **Depends on** issues are closed, and say you are taking it.

4. **Branch, then make the change named in the issue brief.** Follow the brief's files and steps, and add or update a test when behavior changes.

   ```bash
   git switch -c <type>/<issue-number>-<short-name>
   ```

5. **Run the gate, commit, and open a pull request.**

   ```bash
   npm run check
   git commit -am "docs: describe the change"
   git push -u origin HEAD
   ```

   Use a Conventional Commits subject (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) and put `Closes #<issue-number>` in the pull request body. One issue per pull request. If the change touches `.github/workflows/**`, the body also needs a `## Workflow changes` section with `- Reason:` and `- Budget effect:` lines; CI fails without it. The [pull request template](.github/pull_request_template.md) has the section, so start from it when you open the pull request from the command line too (`gh pr create --body-file`).

That is the whole loop. The sections below explain the labels, the optional pre-push hook, how to add a lifecycle rule, the evidence policy, and the [review expectations](#review-expectations).

Coding agents and parallel contributors: follow the [parallel-task protocol in AGENTS.md](AGENTS.md#parallel-task-protocol) (one branch per issue from the same base, shared paths, conflicts, rebase). Do not duplicate that protocol here.

## Find an issue

Every roadmap issue belongs to a phase milestone and is small enough for one pull request. Two labels tell you whether it fits you:

| Lane | Who it suits |
|---|---|
| `lane: free-agent` | New contributors and any coding agent. The issue has a complete brief: files, steps, commands, and a done-check. |
| `lane: strong-agent` | Experienced contributors or strong coding agents. Architecture, contracts, parsers, and new detectors. |
| `lane: maintainer` | Maintainer only: accounts, releases, submissions, and outreach. |

| Size | Expected effort |
|---|---|
| `size: XS` | Under an hour |
| `size: S` | A few hours |
| `size: M` | About a day |

Good places to start:

- [`good first issue`](https://github.com/arminazimi/evergreen/issues?q=is%3Aopen+label%3A%22good+first+issue%22) — isolated changes with fixtures
- The current phase in the [roadmap](docs/ROADMAP.md) and the [project board](https://github.com/users/arminazimi/projects/3)

Pick an issue whose **Depends on** issues are closed, and comment on it to claim it. Epics (`type: epic`) only track tasks; work happens in their task issues.

## Set up

Requires Node.js 22 or newer. You can start developing in one click using GitHub Codespaces, which automatically configures the dev container and installs dependencies:

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/arminazimi/evergreen)

Once the Codespace opens, verify everything is green:

```bash
npm run check
```

For local set up:

```bash
git clone https://github.com/arminazimi/evergreen.git
cd evergreen
npm ci
npm run check
```

`npm run check` builds the project, bundles the Action, runs every test, and checks generated plugin files. It is the same gate CI runs.

While you work, `npm run check:fast` answers in under a minute: it builds, then runs the formatter check, lint, and only the tests that match the files you changed against `origin/main`. It does not replace `npm run check`; the merge queue and CI still run everything.

CI also enforces test coverage floors (93% lines, 87% branches, 93% functions) with `npm run test:coverage`. New code should come with tests so the number stays up; raise the floors in `package.json` when coverage rises, never lower them to make a change pass.

The pull request gate GitHub enforces is one status check, `ci-ok`. It runs after every other CI job and fails when any of them failed or was cancelled; a skipped job counts as passing. Only `ci-ok` is required by branch protection, so the jobs behind it can change without editing repository settings. Maintainers enable the merge queue in [MAINTAINERS.md](MAINTAINERS.md#branch-protection-and-the-merge-queue).

### Optional pre-push hook

The repository ships an opt-in hook with two offline checks. When a push changes a file that the rules read (`src/`, `tools/`, `tests/`, `benchmarks/`, or a rule configuration file), it runs `npm run check:rules`: the formatter, the dead-code scan, type-aware lint, the quality bar, and the architecture boundary check — the same rules as `npm run check`, without the test suite. When the push changes a manifest, lockfile, workflow, or Dockerfile, it builds locally, scans, and blocks the push on any finding the baseline does not cover (the same gate as the `self-scan` CI job). A push that touches neither is not slowed down. The hook uses the dependencies `npm ci` already installs; enabling it needs only `git`.

```bash
git config core.hooksPath .githooks
```

Bypass it once with `git push --no-verify`; undo it with `git config --unset core.hooksPath`.

## Your first contribution: add a lifecycle rule

Lifecycle rules are the most valuable contribution and the easiest place to start. The rules live in [Ebb](https://github.com/velella-sh/ebb), the open lifecycle dataset Evergreen reads, so a new rule or a correction is one pull request there, and it reaches Evergreen with the next Ebb release. Ebb's [contributing guide](https://github.com/velella-sh/ebb/blob/main/CONTRIBUTING.md) walks through it.

This repository adds the part only a scanner can prove: fixtures that show a detector reports the rule.

1. **Find the evidence.** Locate the authoritative source that states the deprecation, for example the package's npm deprecation notice, the maintainer's announcement, or the project's support policy. If you cannot find one, stop here; see the [evidence policy](#evidence-policy).
2. **Add the rule to Ebb** and wait for the release that contains it.
3. **Branch and scaffold the fixtures.**

   ```bash
   git switch -c rule/<package>-deprecated
   npm ci
   npm install @velella/ebb@latest
   npm run build
   node dist/src/cli.js new-rule npm.package.<name>.deprecated
   ```

   It looks the rule up in the installed `@velella/ebb` and creates both fixtures under `tests/fixtures/<rule-id>/`. The whole path, with one real rule: [From a source to a merged pull request](docs/RULES.md#from-a-source-to-a-merged-pull-request).
4. **Write both fixtures.** `tests/fixtures/<rule-id>/match/` holds the smallest repository that must report the rule; `clean/` holds a lookalike that must not. Both are scanned as untrusted input and never executed. If the rule depends on detector behavior rather than usage matching, such as a manifest field or a lockfile form, add a case to [`tests/npm.test.ts`](tests/npm.test.ts) too.
5. **Check.** Run `node dist/src/cli.js rules test <rule-id>`, `npm run build:reference`, then `npm run check`. The last one is the gate CI uses.
6. **Open a pull request** with `Closes #<issue>` (if there is one). The template asks for the commands you ran and the evidence link.

## Add a new detector

New ecosystems start from a generated skeleton, never from a copy of another detector:

```bash
npm run build
node dist/src/cli.js new-detector <id> [--ecosystem <slug>]
```

It creates the detector, a parser, conformance and parser tests with fixtures, and a docs page, and it refuses names that existing detectors or Ebb's registries already use. The detector's rules are added to [Ebb](https://github.com/velella-sh/ebb). [Detector authoring](docs/DETECTORS.md#start-a-new-detector-in-this-repository) describes the files and the order to work in: fixtures, parser, rules, detector, registration, `npm run check`, then `npm run validate:public-repos`. Each of those is a good size for one pull request.

## Evidence policy

Evergreen's findings are only as trustworthy as their sources.

- Every rule links an authoritative, versioned source: maintainer release notes, an official support or end-of-life policy, a registry deprecation flag, or platform documentation.
- Never infer lifecycle status from popularity, download counts, or a newer version existing.
- Dates, affected versions, and replacements must match the source. If the source is ambiguous, say so in the PR.
- Rules are reviewed data, not code. Rule changes are reviewed in [Ebb](https://github.com/velella-sh/ebb); changes to `schemas/` and the rule fixtures here always get maintainer review (see `.github/CODEOWNERS`).

## Other contributions

- **Bugs:** use the bug report form with a minimal fixture, the command, and the actual and expected output.
- **Rule requests without code:** use the [lifecycle rule proposal form](https://github.com/arminazimi/evergreen/issues/new?template=rule-proposal.yml); a product, version range, date, and authoritative source URL are required.
- **New ecosystems:** use the ecosystem request form, or the detector proposal form if you already know the matching boundaries. New detectors are built as an epic of small tasks, each starting from the generated skeleton (see [Add a new detector](#add-a-new-detector)).
- **Importer candidates:** to have a package, project, or action checked for deprecations automatically, add its name to the matching candidate list in Ebb (see its [importers guide](https://github.com/velella-sh/ebb/blob/main/docs/IMPORTERS.md)).
- **Docs and corpus improvements** are welcome without prior discussion.
- **Check the docs site with Slipway's doctor:** pull requests that touch `docs/` run `slipway doctor` and annotate the changed lines (report-only for now). To run it locally, build the site (`cd docs && bundle exec jekyll build --baseurl ""`), then from a checkout of [arminazimi/slipway](https://github.com/arminazimi/slipway) at `v0.2.0` run `npm ci --omit=dev && node packages/doctor/bin/slipway.mjs doctor <path to evergreen>/docs --build <path to evergreen>/docs/_site`. The `slipway` package on npm is a different project, so `npx slipway` does not run the doctor yet.

## Review expectations

A first-time contributor's pull request gets a first review within **two working days**. This is the only review-time target Evergreen publishes.

- **The clock starts** when you open the pull request for review, not when you push the branch. A draft starts its clock when you mark it ready for review. Working days are Monday to Friday, and the day you open it is day zero.
- **A review** is a maintainer's first written response on the diff: a comment, a change request, or an approval. Labels, bots, and acknowledgements do not count.
- **If the target is missed**, comment on the pull request to nudge us and tag `@arminazimi`. If there is still no review by the next working day, comment on the linked issue. A missed target is our problem, not yours; it does not mean the change is unwelcome.

Tests are reviewed against [docs/TESTING.md](docs/TESTING.md): it names every kind of test in this repository, when to use each, a real example to copy, and the anti-patterns that make a test flaky or meaningless.

## Development rules

- Add tests for observable behavior and keep JSON output deterministic across platforms.
- Do not add network calls to the scan path or execute migration commands automatically.
- Do not edit generated files by hand; [AGENTS.md](AGENTS.md#generated-files--do-not-edit-by-hand) lists them and their regenerate commands.
- When changing detector behavior, also run the network-dependent public corpus:

  ```bash
  npm run validate:public-repos
  ```

## Quality standards

These are the requirements every change is held to, and the same answers the OpenSSF Best Practices questionnaire asks for.

- **Coding standard:** TypeScript with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. The build (`npm run build`) fails on any compiler error. Match the naming, comment density, and error style of the surrounding code.
- **Tests:** new functionality and bug fixes come with an automated test in `tests/` that fails without the change. `npm test` runs them all; `npm run test:coverage` enforces the coverage floors above.
- **Static analysis:** CodeQL runs on `main` weekly, and Evergreen scans its own repository on every pull request (`self-scan`).
- **Build:** `npm ci` plus `npm run build` builds from a clean clone using only the locked dependencies; releases are described in [MAINTAINERS.md](MAINTAINERS.md).
- **Security issues:** report them privately as described in [SECURITY.md](SECURITY.md), never in a public issue or pull request.

## Pull requests

One issue per pull request. Explain the lifecycle source, user-visible behavior, tests, and known limitations. Run `npm run check` before requesting review and avoid reformatting unrelated files. Commit messages use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

By contributing, you agree that your contribution is licensed under the repository's Apache-2.0 license.
