# Migration-commit mining queries

These queries are for maintainer-run GitHub code and commit searches. They are
discovery aids, not evidence by themselves, and must never run as part of an
Evergreen scan or `npm run check`.

## GitHub Actions

Run code searches against `path:.github/workflows language:YAML`, then inspect
the history of each matching line for a commit that makes the indicated change.

| Rule | Discovery query | Migration to confirm |
| --- | --- | --- |
| `github-actions.checkout.node20` | `"uses: actions/checkout@v4" path:.github/workflows language:YAML` | `actions/checkout@v4` to `actions/checkout@v5` or later |
| `github-actions.checkout.node20` | `"actions/checkout@v5" path:.github/workflows language:YAML` | Parent contains `actions/checkout@v4`; commit introduces `@v5` |
| `github-actions.setup-node.node20` | `"uses: actions/setup-node@v4" path:.github/workflows language:YAML` | `actions/setup-node@v4` to `actions/setup-node@v5` or later |
| `github-actions.setup-node.node20` | `"actions/setup-node@v5" path:.github/workflows language:YAML` | Parent contains `actions/setup-node@v4`; commit introduces `@v5` |
| `github-actions.cache.node20` | `"uses: actions/cache@v4" path:.github/workflows language:YAML` | `actions/cache@v4` to `actions/cache@v5` or later |
| `github-actions.cache.node20` | `"actions/cache@v5" path:.github/workflows language:YAML` | Parent contains `actions/cache@v4`; commit introduces `@v5` |
| `github-actions.upload-artifact.retired` | `"uses: actions/upload-artifact@v4" path:.github/workflows language:YAML` | `actions/upload-artifact@v4` to `@v7` or later |
| `github-actions.download-artifact.retired` | `"uses: actions/download-artifact@v4" path:.github/workflows language:YAML` | `actions/download-artifact@v4` to `@v7` or later |

Repeat the action queries with `path:action.yml` and `path:action.yaml` to find
composite actions. A candidate is useful only when the changed `uses` value is
literal or SHA-pinned and the referenced release can be mapped unambiguously to
the old and new major versions.

## Node.js runtimes

| Rule | Discovery query | Migration to confirm |
| --- | --- | --- |
| `nodejs.runtime.eol-20` | `"node-version: 20" path:.github/workflows language:YAML` | A later commit changes the runtime to Node.js 22 or later |
| `nodejs.runtime.eol-20` | `"node-version: 22" path:.github/workflows language:YAML` | Parent contains Node.js 20; commit introduces Node.js 22 |
| `nodejs.runtime.eol-18` | `"node-version: 18" path:.github/workflows language:YAML` | A later commit changes the runtime to Node.js 22 or later |
| `nodejs.runtime.eol-18` | `"node-version: 22" path:.github/workflows language:YAML` | Parent contains Node.js 18; commit introduces Node.js 22 |
| `nodejs.runtime.legacy` | `"engines": { "node": "16" language:JSON filename:package.json` | `engines.node` changes from a legacy major to 22 or later |
| `nodejs.runtime.eol-20` | `">=22" filename:.nvmrc` | Parent pins 20; commit pins 22 or later |
| `nodejs.runtime.eol-18` | `"FROM node:22" filename:Dockerfile` | Parent uses a Node.js 18 base image; commit uses 22 or later |

For range declarations, verify the semantic range rather than relying on the
search snippet. Reject candidates where the old range already admitted a
supported runtime and the commit only reformatted the declaration.

## npm packages

| Rule | Discovery query | Migration to confirm |
| --- | --- | --- |
| `npm.package.request.deprecated` | `"request": language:JSON filename:package.json` | Removes `request` and adds native `fetch` or a maintained HTTP client |
| `npm.package.request.deprecated` | `"from 'node-fetch'" language:JavaScript` | Parent imports `request`; commit replaces its call sites with the new client |
| `npm.package.node-sass.eol` | `"node-sass": language:JSON filename:package.json` | Removes `node-sass` and adds `sass` |
| `npm.package.node-sass.eol` | `"sass": language:JSON filename:package.json` | Parent declares `node-sass`; commit declares `sass` and updates lockfiles |
| `npm.package.left-pad.deprecated` | `"left-pad": language:JSON filename:package.json` | Removes `left-pad` and replaces usages with `String.prototype.padStart()` |

Package migrations must include both the manifest/lockfile change and the
corresponding source adaptation when APIs differ. Dependency-only bot updates
without enough context to establish the replacement are not ground truth.

## Python runtimes and packages

| Rule | Discovery query | Migration to confirm |
| --- | --- | --- |
| `python.runtime.eol-3.9-and-older` | `"requires-python = \">=3.9\"" filename:pyproject.toml` | Raises the minimum to a supported Python release |
| `python.runtime.eol-3.9-and-older` | `"requires-python = \">=3.10\"" filename:pyproject.toml` | Parent requires 3.9 or older; commit raises the minimum |
| `python.runtime.eol-3.9-and-older` | `"python-version: 3.9" path:.github/workflows language:YAML` | Removes 3.9-or-older jobs and retains/adds supported versions |
| `python.package.nose.maintenance-only` | `"nose" filename:requirements.txt` | Removes `nose` and migrates tests to pytest, nose2, or unittest |
| `python.package.django-nose.maintenance-only` | `"django-nose" filename:requirements.txt` | Removes `django-nose` and migrates configuration/tests to pytest-django or Django unittest |
| `python.package.pycrypto.obsolete` | `"pycrypto" filename:requirements.txt` | Removes PyCrypto and adopts pycryptodome or cryptography with compatible code changes |

Also repeat package queries for `pyproject.toml`, `setup.py`, `setup.cfg`, and
requirements files with project-specific names.

## How a commit proves ground truth

For every candidate, record immutable, full 40-character SHAs for both the
migration commit and its first parent. The pair proves a finding only when all
of these checks hold:

1. The parent scans with the expected Evergreen rule ID at the expected path.
2. The migration commit no longer reports that finding at that path.
3. The diff directly changes the deprecated declaration or dependency to the
   registry's supported replacement; an unrelated deletion is not sufficient.
4. The commit message, linked issue, release note, or surrounding diff states a
   lifecycle-migration intent consistent with the code change.
5. Both revisions are publicly fetchable, have a compatible repository license,
   and can be checked out without generated credentials or private submodules.
6. The result is reproducible with local, offline scans after the two commits
   have been fetched by the maintainer-run mining tool.

Record the repository URL, both SHAs, rule ID, expected path, evidence URL, and
notes about renamed files or SHA-pinned Actions. Reject merge commits with
ambiguous parents, history rewrites, mass formatting changes that obscure the
migration, and commits whose parent already lacks the finding.
