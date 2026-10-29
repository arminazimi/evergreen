# Contributing to Evergreen

Thanks for helping make software lifecycle changes easier to discover and migrate. You can go from picking an issue to opening a pull request in about 30 minutes; this guide shows how.

Coding agents, and people working with them, should also read [AGENTS.md](AGENTS.md). Questions and ideas go to [GitHub Discussions](https://github.com/arminazimi/evergreen/discussions).

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

CI also enforces test coverage floors (93% lines, 87% branches, 93% functions) with `npm run test:coverage`. New code should come with tests so the number stays up; raise the floors in `package.json` when coverage rises, never lower them to make a change pass.

### Optional pre-push hook

The repository ships an opt-in hook that runs Evergreen on this repository before you push. When the push changes a manifest, lockfile, workflow, or Dockerfile, it builds locally, scans, and blocks the push on any finding the baseline does not cover (the same gate as the `self-scan` CI job). Pushes that touch none of those files are not slowed down.

```bash
git config core.hooksPath .githooks
```

Bypass it once with `git push --no-verify`; undo it with `git config --unset core.hooksPath`.

## Your first contribution: add a lifecycle rule

Lifecycle rules are the most valuable contribution and the easiest place to start. This walkthrough adds an npm package deprecation; other ecosystems follow the same shape.

1. **Find the evidence.** Locate the authoritative source that states the deprecation, for example the package's npm deprecation notice, the maintainer's announcement, or the project's support policy. If you cannot find one, stop here; see the [evidence policy](#evidence-policy).
2. **Branch and scaffold.**

   ```bash
   git switch -c rule/<package>-deprecated
   npm ci
   npm run build
   node dist/src/cli.js new-rule npm.package.<name>.deprecated
   ```

   It appends a placeholder rule to [`registry/npm.json`](registry/npm.json) and creates both fixtures under `tests/fixtures/<rule-id>/`. For another ecosystem, pass `--ecosystem <slug>` with a registry that already exists.
3. **Replace the placeholders** with the claim: `purl` (`pkg:npm/<name>`; scoped names are `pkg:npm/%40scope/name`, and `x-npm.package` is the plain package name), `vers`, `event`, `title`, `summary`, `severity`, `replacement`, `deadline` (only if the source gives a date), `sources`, `provenance` (`observedAt`, `reviewedAt`, `reviewer`), `migration`, and `usage`. The scaffold is valid before you edit it, so the checks below say nothing about whether the values are right. Field by field: [Lifecycle rules](docs/RULES.md#a-rule). The whole path, with one real rule: [From a source to a merged pull request](docs/RULES.md#from-a-source-to-a-merged-pull-request).
4. **Write both fixtures.** `tests/fixtures/<rule-id>/match/` holds the smallest repository that must report the rule; `clean/` holds a lookalike that must not. Both are scanned as untrusted input and never executed. If the rule depends on detector behavior rather than usage matching, such as a manifest field or a lockfile form, add a case to [`tests/npm.test.ts`](tests/npm.test.ts) too.
5. **Check.** Run `node dist/src/cli.js rules lint`, `node dist/src/cli.js rules test <rule-id>`, `npm run build:reference`, then `npm run check`. The last one is the gate CI uses.
6. **Open a pull request** with `Closes #<issue>` (if there is one). The template asks for the commands you ran and the evidence link.

## Add a new detector

New ecosystems start from a generated skeleton, never from a copy of another detector:

```bash
npm run build
node dist/src/cli.js new-detector <id> [--ecosystem <slug>]
```

It creates the detector, a parser, an empty v2 registry, conformance and parser tests with fixtures, and a docs page, and it refuses names that existing detectors or registries already use. [Detector authoring](docs/DETECTORS.md#start-a-new-detector-in-this-repository) describes the files and the order to work in: fixtures, parser, rules, detector, registration, `npm run check`, then `npm run validate:public-repos`. Each of those is a good size for one pull request.

## Evidence policy

Evergreen's findings are only as trustworthy as their sources.

- Every rule links an authoritative, versioned source: maintainer release notes, an official support or end-of-life policy, a registry deprecation flag, or platform documentation.
- Never infer lifecycle status from popularity, download counts, or a newer version existing.
- Dates, affected versions, and replacements must match the source. If the source is ambiguous, say so in the PR.
- Rules are reviewed data, not code. Changes to `registry/` and `schemas/` always get maintainer review (see `.github/CODEOWNERS`).

## Other contributions

- **Bugs:** use the bug report form with a minimal fixture, the command, and the actual and expected output.
- **Rule requests without code:** use the lifecycle rule request form; an authoritative source URL is required.
- **New ecosystems:** use the ecosystem request form, or the detector proposal form if you already know the matching boundaries. New detectors are built as an epic of small tasks, each starting from the generated skeleton (see [Add a new detector](#add-a-new-detector)).
- **Importer candidates:** to have a package, project, or action checked for deprecations automatically, add its name to the matching candidate list (see [docs/IMPORTERS.md](docs/IMPORTERS.md)).
- **Docs and corpus improvements** are welcome without prior discussion.

## Development rules

- Add tests for observable behavior and keep JSON output deterministic across platforms.
- Do not add network calls to the scan path or execute migration commands automatically.
- Do not edit generated files by hand; [AGENTS.md](AGENTS.md#generated-files--do-not-edit-by-hand) lists them and their regenerate commands.
- When changing detector behavior, also run the network-dependent public corpus:

  ```bash
  npm run validate:public-repos
  ```

## Pull requests

One issue per pull request. Explain the lifecycle source, user-visible behavior, tests, and known limitations. Run `npm run check` before requesting review and avoid reformatting unrelated files. Commit messages use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

By contributing, you agree that your contribution is licensed under the repository's Apache-2.0 license.
