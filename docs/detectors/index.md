---
title: Detector reference
---

# Detector reference

Each page documents one ecosystem detector: what it reads, what it reports, and how mature it is. Maturity levels are defined in [COMPATIBILITY.md](../COMPATIBILITY.md#ecosystem-coverage).

| Detector | What it reads | Maturity |
| --- | --- | --- |
| [Android](android.md) | `build.gradle(.kts)`, `settings.gradle(.kts)`, `libs.versions.toml` | Supported |
| [C and C++](cpp.md) | `CMakeLists.txt`, `conanfile.txt`/`py`, `vcpkg.json` | Supported |
| [CI runner images](ci-images.md) | `pool.vmImage` in `azure-pipelines.yml` (GitLab and CircleCI images are read, not judged) | Supported |
| [Container base images](container.md) | `FROM` lines in Dockerfiles/Containerfiles and `services.*.image` in Compose | Supported |
| [Dart and Flutter](dart.md) | `pubspec.yaml`/`lock`, `.fvmrc`, `.fvm/fvm_config.json` | Supported |
| [Database runtimes](database.md) | Compose image tags and managed DB versions in `*.tf` | Experimental |
| [Deno and Bun](deno.md) | Exact runtime pins in `deno.json(c)`, `bunfig.toml`, `.bun-version`, `.tool-versions` | Supported |
| [.NET](dotnet.md) | `global.json`, project files, `Directory.Build.props`, `Directory.Packages.props`, `packages.lock.json` | Beta |
| [Elixir and Mix](elixir.md) | `.tool-versions`, `mix.exs`, `mix.lock` | Supported |
| [Go](go.md) | `go.mod` and `go.work` directives and direct require | Supported |
| [Java and Kotlin (JVM)](java.md) | `pom.xml`, Gradle, `.java-version`, `.sdkmanrc`, `.tool-versions`, Maven deps | Beta |
| [Kubernetes APIs](kubernetes.md) | `apiVersion`/`kind` in YAML, Helm templates, kustomization | Beta |
| [PHP](php.md) | `.php-version`, `.tool-versions`, `composer.json`, `composer.lock` | Supported |
| [Ruby](ruby.md) | `.ruby-version`, `.tool-versions`, `Gemfile`, `Gemfile.lock` | Supported |
| [Rust](rust.md) | `rust-toolchain(.toml)`, `Cargo.toml`, `Cargo.lock` | Supported |
| [Scala and sbt](scala.md) | `.scala-version`, `build.sbt`, `project/build.properties` | Experimental |
| [Serverless runtimes](serverless.md) | SAM/CloudFormation Runtime, `serverless.yml`, Terraform runtimes | Beta |
| [Shell and PowerShell](shell.md) | `#Requires -Version`, `PowerShellVersion`, powershell image tags | Supported |
| [Swift](swift.md) | `.swift-version`, `.xcode-version`, `Package.swift`, `Package.resolved`, `IPHONEOS_DEPLOYMENT_TARGET` | Beta |
| [Terraform](terraform.md) | `*.tf`, `.terraform.lock.hcl`, `.terraform-version`, `.tool-versions` | Experimental |

To author a new detector, see the [Detector SDK](../DETECTORS.md).
