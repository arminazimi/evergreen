---
title: 90-second demo
---

# 90-second demo

This repository includes a deliberately outdated project at `examples/demo`. Its manifest is stored as `package.json.fixture`; the example helper restores the real name in a temporary copy. It declares an unsupported Node.js range, uses the deprecated `request` package, and runs an old checkout action.

```bash
git clone https://github.com/arminazimi/evergreen.git
cd evergreen
npm ci
npm run build
demo="$(node dist/tools/examples.js demo)"
node dist/src/cli.js scan "$demo"
```

Evergreen reports four evidence-backed lifecycle findings: Node.js 18 and 20, `request`, and `actions/checkout@v4`. Each result includes the exact declaration, severity, replacement, and authoritative sources.

Pick the `request` finding ID from the scan and inspect it:

```bash
node dist/src/cli.js explain '<finding-id>' "$demo"
node dist/src/cli.js context '<finding-id>' "$demo" --json
```

The context packet identifies `package.json` and `src/client.js`, preserves HTTP behavior as a migration constraint, proposes ordered changes, and suggests checks. Evergreen does not modify files or execute suggested commands.

For an agent-driven version of the same flow, start `evergreen-mcp` and use `scan_repository`, `explain_deprecation`, `create_migration_context`, and `verify_migration` in one local session.

## Example gallery

`examples/gallery` holds one minimal repository per detector, each with the exact findings a scan must return in `expected.json`. They exist to show each detector working in thirty seconds; they are deliberately outdated, so do not copy them into a real project.

Files a dependency scanner reads by name are committed under the neutral names from [decision 0027](https://github.com/arminazimi/evergreen/blob/main/docs/decisions/0027-fixtures-invisible-to-scanners.md), such as `Gemfile.lock.fixture`, so an example never appears as the repository's own dependency. The command below copies an example to a temporary directory, restores the real names there, and runs Evergreen inside it; nothing is written to the repository.

| Ecosystem | Directory | What it declares |
|---|---|---|
| Android | `examples/gallery/android` | Play Billing 5 in a Groovy and a Kotlin build script |
| CI images | `examples/gallery/ci-images` | Ubuntu 20.04 and Windows 2019 agents in Azure Pipelines |
| Containers | `examples/gallery/container` | Old Node, Python, Debian, Ubuntu, Alpine, Redis, and PostgreSQL base images across Dockerfiles, Compose, and a devcontainer |
| C++ | `examples/gallery/cpp` | `cmake_minimum_required` below the policy floor |
| Dart | `examples/gallery/dart` | A `pubspec.yaml` SDK constraint on an unsupported Dart release |
| Databases | `examples/gallery/database` | MySQL 5.7 and PostgreSQL 12 in Compose and Terraform |
| Deno | `examples/gallery/deno` | A Deno 1.x project and a Bun 1.0 pin |
| .NET | `examples/gallery/dotnet` | .NET 3.1, 5.0, 6.0, and 8.0 targets, + `global.json`, `Directory.Build.props`, central package versions, and a deprecated Azure storage package |
| Elixir | `examples/gallery/elixir` | Elixir 1.14 and Erlang 25, plus a retired package in `mix.exs` and `mix.lock` |
| GitHub Actions | `examples/gallery/github-actions` | `actions/checkout` on the retired Node 20 runtime |
| Go | `examples/gallery/go` | Go 1.22 and 1.23 in `go.mod` and `go.work` |
| Java | `examples/gallery/java` | JDK pins in Maven, Gradle, the version catalog, `.sdkmanrc`, `.tool-versions`, and `.java-version`; Spring Boot 2.x and 3.x plus a relocated Hibernate artifact |
| Kubernetes | `examples/gallery/kubernetes` | Removed `extensions/v1beta1`, `networking.k8s.io/v1beta1`, `policy/v1beta1`, and `batch/v1beta1` APIs, a pod security policy, and the retired Helm stable repository |
| Node.js | `examples/gallery/nodejs` | `.nvmrc` on Node.js 20 |
| npm | `examples/gallery/npm` | A dependency on the deprecated `request` package |
| PHP | `examples/gallery/php` | PHP 7.4 in `composer.json`, `composer.lock`, `.php-version`, and `.tool-versions` |
| Python | `examples/gallery/python` | `.python-version` on Python 3.9 |
| Ruby | `examples/gallery/ruby` | Ruby 3.2 in `.ruby-version`, `.tool-versions`, the `Gemfile`, and `Gemfile.lock` |
| Rust | `examples/gallery/rust` | Unmaintained crates (`failure`, `ansi-term`, `atty`, `tempdir`) and a toolchain pin on Rust 1.98 |
| Scala | `examples/gallery/scala` | Scala 2.11 and sbt 0.13 |
| Serverless | `examples/gallery/serverless` | Retired Lambda and Cloud Functions runtimes in a SAM template, a Serverless Framework service, and Terraform |
| Shell | `examples/gallery/shell` | PowerShell 7.0 in a module manifest and script, plus `actions/checkout` on Node 20 |
| Swift | `examples/gallery/swift` | An Xcode version in the App Store removal window |
| Terraform | `examples/gallery/terraform` | `.terraform-version` on an unsupported CLI release |

Scan any example the same way as the demo:

```bash
npm run build
node dist/tools/examples.js gallery/kubernetes scan
```

Use `npm run --silent example -- <example> <command>` for the same thing. With no command the tool prints the temporary directory and leaves it in place:

```bash
node dist/tools/examples.js gallery/php
```

Any other command accepts a whole example directory the same way:

```bash
node dist/tools/examples.js gallery countdown --as-of 2026-10-25
```

The gallery is part of `npm run check`. To run only its test:

```bash
npm run build
node --test dist/tests/examples-gallery.test.js
```

The test scans every example twice and compares the result to `expected.json` as a whole, so a rule or detector change that alters an example fails CI until the example and its expected output are reviewed together.
