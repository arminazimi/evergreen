# Attribution notice

`evergreen-data` is Evergreen's lifecycle dataset: the reviewed lifecycle rules in `registry/` and the first-party JSON Schemas in `schemas/`.

Copyright 2026 Armin Azimi and Evergreen contributors.

Licensed under the [Creative Commons Attribution 4.0 International License](LICENSE) (CC BY 4.0). You may share and adapt the dataset, including commercially, as long as you give appropriate credit, link to the license, and say if you changed the files.

## How to credit it

> Lifecycle data from Evergreen (`evergreen-data`), by Armin Azimi and Evergreen contributors, licensed under CC BY 4.0. https://github.com/arminazimi/evergreen

Add a note when you modified the data, for example when you filtered it, merged it into another dataset, or renamed rules.

## What Evergreen contributes

Evergreen selects which components to track, normalizes the lifecycle dates of each rule, and writes the rule identifiers, event types, replacement guidance, and other descriptive text. It also maintains the schemas the files are validated against.

## Upstream sources

Every rule cites its evidence in its own `sources` field (title and URL) together with the `reviewedAt` date. The repository's `registry/sources.lock.json` records every cited URL, its resolved destination, and the date it was checked; it is maintainer tooling and is not part of this package.

The rules are compiled from:

- Project and vendor support statements, for example the [Node.js release schedule](https://nodejs.org/en/about/eol), the [Python versions status](https://devguide.python.org/versions/), [Adoptium support](https://adoptium.net/support/), the [Oracle Java SE support roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html), and the [Kubernetes deprecation guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/).
- Package registry metadata from [npm](https://registry.npmjs.org/), [PyPI](https://pypi.org/), and [Maven Central](https://repo1.maven.org/maven2/), such as deprecation notices and release dates.
- Release notes, changelogs, and the [GitHub changelog](https://github.blog/changelog/) for the GitHub Actions rules, and commit SHAs recorded in `registry/github-actions-shas.json`.
- Advisory identifiers from [OSV](https://osv.dev/) in `registry/osv.json`. Evergreen stores identifiers only, not advisory text.

The facts those sources state remain subject to their own terms. CC BY 4.0 covers Evergreen's selection, arrangement, normalization, and original text, not the upstream material it describes. Product and project names are trademarks of their owners, and this dataset implies no affiliation with or endorsement by them.
