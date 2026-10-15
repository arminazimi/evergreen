// Ecosystem detector epics. Each ecosystem expands into small, independently
// mergeable tasks so free agents and new contributors can pick them up.

export const ECOSYSTEMS = [
  {
    id: "go", name: "Go", epic: "#43", month: "M2", tier: 1, language: true,
    manifests: [
      { file: "go.mod", what: "`go` and `toolchain` directives and direct `require` entries" },
      { file: "go.work", what: "`go` and `toolchain` directives" },
    ],
    sources: [
      { name: "Go release history and support policy", url: "https://go.dev/doc/devel/release" },
      { name: "Go module deprecation comments", url: "https://go.dev/ref/mod#go-mod-file-module-deprecation" },
    ],
    importers: [
      { name: "Go release support policy", url: "https://go.dev/doc/devel/release" },
      { name: "`// Deprecated:` comments on direct modules", url: "https://go.dev/ref/mod#go-mod-file-module-deprecation" },
    ],
    verify: "go build ./... && go test ./...",
    corpus: "Go CLIs, services, and Kubernetes operators",
  },
  {
    id: "container", name: "Container base images", epic: "#15", month: "M2", tier: 1, language: false,
    designFirst: true,
    manifests: [
      { file: "Dockerfile / *.Dockerfile / Containerfile", what: "`FROM` instructions (tags, digests, `--platform`, multi-stage names)" },
      { file: "compose.yaml / docker-compose.yml", what: "`image:` entries" },
    ],
    sources: [
      { name: "Docker Official Images documentation", url: "https://github.com/docker-library/official-images" },
      { name: "Distribution and runtime vendor lifecycle pages (e.g. Debian, Ubuntu, Alpine, Node, Python images)", url: "https://endoflife.date" },
    ],
    importers: [
      { name: "Official image tags mapped to vendor lifecycle (vendor source required)", url: "https://github.com/docker-library/official-images" },
    ],
    verify: "docker build .",
    corpus: "repositories with Dockerfiles and Compose files",
  },
  {
    id: "rust", name: "Rust", epic: "#46", month: "M3", tier: 1, language: true,
    manifests: [
      { file: "Cargo.toml", what: "`edition`, `rust-version`, and direct dependencies" },
      { file: "Cargo.lock", what: "resolved crate versions" },
      { file: "rust-toolchain.toml / rust-toolchain", what: "pinned toolchain channel" },
    ],
    sources: [
      { name: "Rust release channels and editions", url: "https://doc.rust-lang.org/edition-guide/" },
      { name: "crates.io yanked versions", url: "https://doc.rust-lang.org/cargo/commands/cargo-yank.html" },
    ],
    importers: [
      { name: "Rust toolchain and edition lifecycle", url: "https://forge.rust-lang.org/" },
      { name: "Yanked crate versions for direct dependencies", url: "https://crates.io/data-access" },
    ],
    verify: "cargo check && cargo test",
    corpus: "Rust CLIs, libraries, and workspaces",
  },
  {
    id: "java", name: "Java and Kotlin (JVM)", epic: "#49", month: "M3", tier: 1, language: true,
    manifests: [
      { file: "pom.xml", what: "`maven.compiler.release/source/target`, `java.version`, and direct dependencies" },
      { file: "build.gradle / build.gradle.kts", what: "toolchain `languageVersion`, `sourceCompatibility`, Kotlin plugin version" },
      { file: "gradle/wrapper/gradle-wrapper.properties", what: "Gradle distribution version" },
      { file: ".java-version / .sdkmanrc / .tool-versions", what: "pinned JDK" },
    ],
    sources: [
      { name: "Oracle Java SE support roadmap", url: "https://www.oracle.com/java/technologies/java-se-support-roadmap.html" },
      { name: "Eclipse Adoptium support", url: "https://adoptium.net/support/" },
      { name: "Gradle compatibility matrix", url: "https://docs.gradle.org/current/userguide/compatibility.html" },
    ],
    importers: [
      { name: "JDK distribution support dates", url: "https://adoptium.net/support/" },
      { name: "Maven relocations for direct dependencies", url: "https://maven.apache.org/guides/mini/guide-relocation.html" },
    ],
    verify: "./mvnw verify || ./gradlew build",
    corpus: "Maven and Gradle services and libraries",
  },
  {
    id: "dotnet", name: ".NET", epic: "#48", month: "M3", tier: 1, language: true,
    manifests: [
      { file: "global.json", what: "pinned SDK version" },
      { file: "*.csproj / *.fsproj / *.vbproj", what: "`TargetFramework(s)` and `PackageReference`" },
      { file: "Directory.Packages.props / Directory.Build.props", what: "central package versions and shared target frameworks" },
      { file: "packages.lock.json", what: "resolved package versions" },
    ],
    sources: [
      { name: ".NET support policy", url: "https://dotnet.microsoft.com/platform/support/policy/dotnet-core" },
      { name: ".NET releases index", url: "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json" },
      { name: "NuGet package deprecation", url: "https://learn.microsoft.com/nuget/nuget-org/deprecate-packages" },
    ],
    importers: [
      { name: ".NET release metadata (releases-index.json)", url: "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json" },
      { name: "NuGet deprecation metadata for direct packages", url: "https://learn.microsoft.com/nuget/api/registration-base-url-resource" },
    ],
    verify: "dotnet build && dotnet test",
    corpus: "ASP.NET Core services, libraries, and multi-project solutions",
  },
  {
    id: "kubernetes", name: "Kubernetes APIs", epic: "#52", month: "M3", tier: 1, language: false,
    manifests: [
      { file: "Kubernetes YAML manifests", what: "`apiVersion` and `kind` per document (multi-document YAML)" },
      { file: "Helm charts (Chart.yaml, templates/)", what: "`kubeVersion` and literal `apiVersion` values in templates" },
      { file: "kustomization.yaml", what: "referenced resources and patches" },
    ],
    sources: [
      { name: "Kubernetes deprecated API migration guide", url: "https://kubernetes.io/docs/reference/using-api/deprecation-guide/" },
      { name: "Kubernetes release history", url: "https://kubernetes.io/releases/" },
    ],
    importers: [
      { name: "Kubernetes deprecated API migration guide", url: "https://kubernetes.io/docs/reference/using-api/deprecation-guide/" },
      { name: "Kubernetes release support windows", url: "https://kubernetes.io/releases/" },
    ],
    verify: "kubeconform -strict <manifests> (or kubectl apply --dry-run=server)",
    corpus: "Helm charts, GitOps repositories, and operators",
  },
  {
    id: "serverless", name: "Serverless runtimes", epic: "E-serverless", month: "M3", tier: 1, language: false,
    manifests: [
      { file: "template.yaml / template.yml (AWS SAM, CloudFormation)", what: "`Runtime` of functions and `Globals`" },
      { file: "serverless.yml", what: "`provider.runtime` and per-function `runtime`" },
      { file: "*.tf", what: "`runtime` of `aws_lambda_function`, and function app stacks" },
    ],
    sources: [
      { name: "AWS Lambda runtime deprecation policy", url: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html" },
      { name: "Azure Functions language runtime support", url: "https://learn.microsoft.com/azure/azure-functions/language-support-policy" },
      { name: "Google Cloud Functions runtime support", url: "https://cloud.google.com/functions/docs/runtime-support" },
    ],
    importers: [
      { name: "AWS Lambda supported and deprecated runtimes table", url: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html" },
      { name: "Google Cloud runtime support schedule", url: "https://cloud.google.com/functions/docs/runtime-support" },
    ],
    verify: "sam validate || serverless print || terraform validate",
    corpus: "SAM, Serverless Framework, and Terraform serverless projects",
  },
  {
    id: "terraform", name: "Terraform", epic: "#56", month: "M4", tier: 1, language: false,
    manifests: [
      { file: "*.tf (terraform block)", what: "`required_version` and `required_providers` constraints" },
      { file: ".terraform.lock.hcl", what: "locked provider versions" },
      { file: ".terraform-version / .tool-versions", what: "pinned Terraform CLI" },
    ],
    sources: [
      { name: "HashiCorp Terraform support policy", url: "https://support.hashicorp.com/hc/en-us/articles/360021185113" },
      { name: "Provider upgrade guides (registry)", url: "https://registry.terraform.io/" },
    ],
    importers: [
      { name: "Terraform CLI release support", url: "https://github.com/hashicorp/terraform/releases" },
      { name: "Major provider upgrade guides (aws, azurerm, google)", url: "https://registry.terraform.io/" },
    ],
    verify: "terraform init -backend=false && terraform validate",
    corpus: "Terraform modules and infrastructure repositories",
  },
  {
    id: "android", name: "Android", epic: "#50", month: "M4", tier: 2, language: false,
    manifests: [
      { file: "build.gradle(.kts) (android block)", what: "`compileSdk`, `targetSdk`, `minSdk`, `buildToolsVersion`" },
      { file: "settings.gradle(.kts) / libs.versions.toml", what: "Android Gradle Plugin version" },
    ],
    sources: [
      { name: "Google Play target API level requirements", url: "https://developer.android.com/google/play/requirements/target-sdk" },
      { name: "Android Gradle Plugin release notes", url: "https://developer.android.com/build/releases/gradle-plugin" },
    ],
    importers: [
      { name: "Google Play target API requirements", url: "https://developer.android.com/google/play/requirements/target-sdk" },
    ],
    verify: "./gradlew assembleDebug",
    corpus: "open-source Android apps",
  },
  {
    id: "dart", name: "Dart and Flutter", epic: "#53", month: "M4", tier: 2, language: true,
    manifests: [
      { file: "pubspec.yaml", what: "`environment.sdk`, `environment.flutter`, and direct dependencies" },
      { file: "pubspec.lock", what: "resolved package versions and SDK constraints" },
      { file: ".fvmrc / .fvm/fvm_config.json", what: "pinned Flutter version" },
    ],
    sources: [
      { name: "Dart SDK release notes", url: "https://dart.dev/get-dart/archive" },
      { name: "pub.dev discontinued packages", url: "https://dart.dev/tools/pub/publishing#discontinue" },
    ],
    importers: [
      { name: "pub.dev discontinued flag for direct packages", url: "https://github.com/dart-lang/pub/blob/master/doc/repository-spec-v2.md" },
    ],
    verify: "dart analyze && flutter test",
    corpus: "Flutter apps and Dart packages",
  },
  {
    id: "swift", name: "Swift and Apple toolchains", epic: "#55", month: "M4", tier: 2, language: true,
    manifests: [
      { file: "Package.swift", what: "`swift-tools-version` and platform minimums" },
      { file: "Package.resolved", what: "resolved package versions" },
      { file: ".swift-version / .xcode-version", what: "pinned toolchain" },
    ],
    sources: [
      { name: "Swift.org releases", url: "https://www.swift.org/download/" },
      { name: "App Store Xcode and SDK requirements", url: "https://developer.apple.com/news/upcoming-requirements/" },
    ],
    importers: [
      { name: "App Store upcoming SDK and Xcode requirements", url: "https://developer.apple.com/news/upcoming-requirements/" },
    ],
    verify: "swift build && swift test",
    corpus: "Swift packages and iOS apps",
  },
  {
    id: "php", name: "PHP", epic: "#45", month: "M5", tier: 2, language: true,
    manifests: [
      { file: "composer.json", what: "`require.php`, `config.platform.php`, and direct packages" },
      { file: "composer.lock", what: "resolved package versions and `abandoned` flags" },
      { file: ".php-version / .tool-versions", what: "pinned runtime" },
    ],
    sources: [
      { name: "PHP supported versions", url: "https://www.php.net/supported-versions.php" },
      { name: "Packagist abandoned packages", url: "https://packagist.org/apidoc" },
    ],
    importers: [
      { name: "PHP supported versions", url: "https://www.php.net/supported-versions.php" },
      { name: "Packagist `abandoned` flag for direct packages", url: "https://packagist.org/apidoc" },
    ],
    verify: "composer validate && vendor/bin/phpunit",
    corpus: "Laravel, Symfony, and WordPress-adjacent projects",
  },
  {
    id: "ruby", name: "Ruby", epic: "#54", month: "M5", tier: 2, language: true,
    manifests: [
      { file: ".ruby-version / .tool-versions", what: "pinned runtime" },
      { file: "Gemfile", what: "`ruby` directive and direct gems" },
      { file: "Gemfile.lock", what: "resolved gem versions and `RUBY VERSION`" },
      { file: "*.gemspec", what: "`required_ruby_version`" },
    ],
    sources: [
      { name: "Ruby maintenance branches", url: "https://www.ruby-lang.org/en/downloads/branches/" },
      { name: "RubyGems yanked versions", url: "https://guides.rubygems.org/rubygems-org-api/" },
    ],
    importers: [
      { name: "Ruby maintenance branches", url: "https://www.ruby-lang.org/en/downloads/branches/" },
    ],
    verify: "bundle exec rake test",
    corpus: "Rails apps and Ruby gems",
  },
  {
    id: "cpp", name: "C and C++", epic: "#44", month: "M5", tier: 2, language: false,
    manifests: [
      { file: "CMakeLists.txt", what: "`cmake_minimum_required`, `CMAKE_CXX_STANDARD`, and compiler checks" },
      { file: "conanfile.txt / conanfile.py", what: "direct requirements" },
      { file: "vcpkg.json", what: "direct dependencies and baseline" },
    ],
    sources: [
      { name: "CMake policy and compatibility deprecations", url: "https://cmake.org/cmake/help/latest/manual/cmake-policies.7.html" },
    ],
    importers: [
      { name: "CMake minimum-version compatibility removals", url: "https://cmake.org/cmake/help/latest/command/cmake_minimum_required.html" },
    ],
    verify: "cmake -S . -B build && cmake --build build",
    corpus: "CMake, Conan, and vcpkg projects",
  },
  {
    id: "shell", name: "Shell and PowerShell", epic: "#47", month: "M5", tier: 2, language: false,
    manifests: [
      { file: "*.ps1 / *.psm1 / *.psd1", what: "`#Requires -Version` and `PowerShellVersion`" },
      { file: "CI workflow files", what: "`shell:` declarations and pinned PowerShell or Bash images" },
    ],
    sources: [
      { name: "PowerShell support lifecycle", url: "https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle" },
    ],
    importers: [
      { name: "PowerShell support lifecycle", url: "https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle" },
    ],
    verify: "pwsh -NoProfile -Command \"$PSVersionTable\"",
    corpus: "automation and infrastructure script repositories",
  },
  {
    id: "database", name: "Database runtimes", epic: "#51", month: "M5", tier: 2, language: false,
    manifests: [
      { file: "compose.yaml / docker-compose.yml", what: "`postgres`, `mysql`, `mariadb`, `redis`, `mongo` image tags" },
      { file: "*.tf", what: "`engine_version` on managed database resources" },
    ],
    sources: [
      { name: "PostgreSQL versioning policy", url: "https://www.postgresql.org/support/versioning/" },
      { name: "MySQL lifecycle", url: "https://www.mysql.com/support/supportedplatforms/database.html" },
    ],
    importers: [
      { name: "PostgreSQL versioning policy", url: "https://www.postgresql.org/support/versioning/" },
      { name: "Redis and MongoDB release lifecycles (vendor sources)", url: "https://endoflife.date" },
    ],
    verify: "docker compose config",
    corpus: "applications with Compose or Terraform database declarations",
  },
  {
    id: "ci-images", name: "CI runner images (GitLab, CircleCI, Azure Pipelines)", epic: "E-ci-images", month: "M5", tier: 2, language: false,
    manifests: [
      { file: ".gitlab-ci.yml", what: "`image:` and `services:`" },
      { file: ".circleci/config.yml", what: "`machine.image`, `docker.image`, and orbs" },
      { file: "azure-pipelines.yml", what: "`pool.vmImage`" },
    ],
    sources: [
      { name: "Azure Pipelines hosted image retirements", url: "https://learn.microsoft.com/azure/devops/pipelines/agents/hosted" },
      { name: "CircleCI image deprecations", url: "https://circleci.com/docs/images/" },
    ],
    importers: [
      { name: "Azure Pipelines hosted image retirement announcements", url: "https://github.com/actions/runner-images" },
    ],
    verify: "gitlab-ci-lint / circleci config validate",
    corpus: "repositories using GitLab CI, CircleCI, or Azure Pipelines",
  },
];

const DONT = [
  "Do not add network access to scans; detectors read only repository files and bundled data.",
  "Do not change the core engine or public contracts in this PR.",
];

function eco(e, suffix) {
  return `${e.id}.${suffix}`;
}

export function ecosystemTasks(e) {
  const tasks = [];
  const base = { epic: e.epic, month: e.month, eco: e.id };
  const parserKeys = [];

  if (e.designFirst) {
    tasks.push({
      ...base, key: eco(e, "design"), title: `${e.name}: write the detector design decision record`,
      lane: "strong", size: "S", types: ["type: docs"], areas: ["area: detector"],
      goal: `Decide which ${e.name} declarations can be classified deterministically before code is written.`,
      files: ["docs/decisions/00NN-<ecosystem>-detector.md"],
      steps: [
        "Answer: which declaration forms are deterministic, which are dynamic (build args, variables), and how tags vs digests are handled.",
        "List authoritative lifecycle sources and explicitly reject popularity- or latest-version-based inference.",
        "List out-of-scope cases for the first version.",
      ],
      done: ["Decision record merged.", "True-positive and false-positive examples listed for the fixture task."],
      deps: [],
    });
  }

  tasks.push({
    ...base, key: eco(e, "fixtures"), title: `${e.name}: add positive, negative, zero-finding, and malformed fixtures`,
    lane: "free", size: "S", types: ["type: fixture"], areas: ["area: detector"], goodFirst: true,
    goal: `Create the fixture repositories every ${e.name} task will test against.`,
    files: [`tests/fixtures/${e.id}/`],
    steps: [
      `Add at least one positive fixture per declaration type: ${e.manifests.map((m) => m.file).join("; ")}.`,
      "Add lookalike negatives (comments, unrelated keys, dynamic values) that must not produce findings.",
      "Add one zero-finding fixture and one malformed-file fixture.",
      "Add a short README in the fixture folder describing each case.",
    ],
    done: ["Fixtures exist with a README.", "`npm run check` passes."],
    deps: e.designFirst ? [eco(e, "design")] : [],
  });

  e.manifests.forEach((m, i) => {
    const key = eco(e, `parse-${i + 1}`);
    parserKeys.push(key);
    tasks.push({
      ...base, key, title: `${e.name}: parse ${m.file} with exact line locations`,
      lane: "free", size: "S", types: ["type: parser"], areas: ["area: detector"], helpWanted: true,
      goal: `Read ${m.what} from ${m.file} and return typed declarations with file and line.`,
      files: [`src/detectors/${e.id}/parse-*.ts`, `tests/${e.id}-parse.test.ts`],
      steps: [
        "Write a pure function: file contents in, declarations with `{ value, line }` out. No I/O inside the parser.",
        "Treat contents as untrusted: bound input size, never evaluate code, never execute tools.",
        "Return nothing (not an error) for unsupported or dynamic forms, and document them.",
        "Test with the fixtures from the fixture task, including malformed input.",
      ],
      done: ["Parser and tests merged.", "Malformed and dynamic cases covered by tests.", "`npm run check` passes."],
      dont: DONT,
      deps: [eco(e, "fixtures")],
    });
  });

  tasks.push({
    ...base, key: eco(e, "rules"), title: `${e.name}: create the registry file and the first 5 curated rules`,
    lane: "free", size: "S", types: ["type: rule"], areas: ["area: data"], goodFirst: true,
    goal: `Seed registry/${e.id}.json with five evidence-backed lifecycle rules in rule format v2.`,
    files: [`registry/${e.id}.json`],
    steps: [
      "Use the v2 rule format (PURL + VERS + provenance). Copy the shape of an existing migrated registry file.",
      `Every rule links an authoritative source, for example: ${e.sources.map((s) => `[${s.name}](${s.url})`).join(", ")}.`,
      "Include `observedAt`, `reviewedAt`, severity, deadline, and replacement guidance.",
      "Never infer lifecycle status from popularity or from a newer version existing.",
    ],
    done: ["Registry validates with the v2 schema.", "Every rule has a working authoritative source link.", "`npm run check` passes."],
    deps: ["rulev2.schema"],
  });

  e.importers.forEach((imp, i) => {
    tasks.push({
      ...base, key: eco(e, `import-${i + 1}`), title: `${e.name}: import lifecycle signals from ${imp.name}`,
      lane: "free", size: "M", types: ["type: importer"], areas: ["area: data"], helpWanted: true,
      goal: `Turn ${imp.name} into reviewable draft rules using the importer framework.`,
      files: [`tools/importers/${e.id}-${i + 1}.ts`, `tests/importers/${e.id}-${i + 1}.test.ts`, `tests/importers/recordings/`],
      steps: [
        `Implement the importer interface for ${imp.url}.`,
        "Record one real response into `tests/importers/recordings/` so tests run offline.",
        "Normalize into v2 draft rules with provenance (`sourceUrl`, `observedAt`).",
        "Emit a diff against the existing registry; never write the registry directly.",
      ],
      done: ["Importer produces draft rules from the recording.", "Tests run offline.", "`npm run check` passes."],
      deps: ["data.importer-interface", "data.importer-recordings"],
    });
  });

  tasks.push({
    ...base, key: eco(e, "detector"), title: `${e.name}: wire the detector with the scaffold and pass conformance`,
    lane: "strong", size: "M", types: ["type: task"], areas: ["area: detector"],
    goal: `Combine the ${e.name} parsers and registry into a detector registered in the engine.`,
    files: [`src/detectors/${e.id}/index.ts`, "src/detectors/index.ts", `tests/${e.id}.test.ts`],
    steps: [
      "Generate the skeleton with the scaffold command.",
      "Match parsed declarations against registry rules using VERS ranges.",
      "Register the detector and mark its maturity as `experimental`.",
      "Run the shared conformance suite.",
    ],
    done: ["Conformance suite passes.", "All fixtures produce the expected findings.", "`npm run check` passes."],
    dont: DONT,
    deps: [...parserKeys, eco(e, "rules"), "scaffold.command", "conf.harness"],
  });

  if (e.language) {
    tasks.push({
      ...base, key: eco(e, "usage"), title: `${e.name}: map affected imports and usages to files`,
      lane: "strong", size: "M", types: ["type: task"], areas: ["area: detector"],
      goal: `Report where ${e.name} source files use an affected package or API so migration packets list exact files.`,
      files: ["src/source-usage.ts or the tree-sitter usage engine", `tests/${e.id}-usage.test.ts`],
      steps: [
        "Prefer the tree-sitter usage engine when it is merged; otherwise follow the existing usage-analysis pattern.",
        "Cover imports, aliases, and qualified calls; report unknown dynamic forms as unclassified.",
      ],
      done: ["Usage counts appear in scan output and migration packets.", "`npm run check` passes."],
      dont: DONT,
      deps: [eco(e, "detector")],
    });
  }

  tasks.push({
    ...base, key: eco(e, "migration"), title: `${e.name}: add migration steps and verification commands to curated rules`,
    lane: "free", size: "S", types: ["type: rule"], areas: ["area: data"], goodFirst: true,
    goal: `Make \`evergreen context\` produce a useful ${e.name} migration packet.`,
    files: [`registry/${e.id}.json`, `tests/${e.id}.test.ts`],
    steps: [
      "Add `migration.constraints`, `migration.steps`, and `migration.verification` to each curated rule.",
      `Use real verification commands such as \`${e.verify}\`.`,
      "Add one end-to-end test that builds a migration packet for a fixture.",
    ],
    done: ["Every curated rule has migration guidance.", "`npm run check` passes."],
    deps: [eco(e, "detector")],
  });

  tasks.push({
    ...base, key: eco(e, "corpus"), title: `${e.name}: add 5 pinned public repositories with independent ground truth`,
    lane: "free", size: "S", types: ["type: fixture"], areas: ["area: validation"], goodFirst: true,
    goal: `Measure ${e.name} accuracy on real ${e.corpus}.`,
    files: ["benchmarks/public-repositories.json"],
    steps: [
      "Pick 5 public repositories pinned to immutable commits, including at least one zero-finding repository.",
      "Record ground truth from an independent source (a maintainer's migration commit, an upstream changelog, or a CI failure), not from Evergreen output.",
      "Fill `groundTruthSource` for every expected finding.",
    ],
    done: ["Corpus entries merged with ground-truth sources.", "`npm run validate:public-repos` reports results for the new entries."],
    deps: [eco(e, "detector"), "truth.schema"],
  });

  tasks.push({
    ...base, key: eco(e, "docs"), title: `${e.name}: document supported declarations and limits`,
    lane: "free", size: "XS", types: ["type: docs"], areas: ["area: docs"], goodFirst: true,
    goal: `Tell users exactly what the ${e.name} detector covers and what it intentionally ignores.`,
    files: ["docs/DETECTORS.md", "docs/COMPATIBILITY.md"],
    steps: [
      "List supported files and declaration forms, maturity level, and data sources.",
      "List unsupported and dynamic forms and known false-positive boundaries.",
    ],
    done: ["Docs merged and linked from the README coverage table."],
    deps: [eco(e, "detector")],
  });

  return tasks;
}

export function ecosystemEpic(e) {
  return {
    key: e.epic, kind: "epic", month: e.month, eco: e.id, areas: ["area: detector"],
    title: `Epic: ${e.name} lifecycle detection`,
    goal: `Detect evidence-backed ${e.name} lifecycle risks at exact locations and produce migration packets, built from small independent tasks.`,
    scope: [
      ...e.manifests.map((m) => `${m.file}: ${m.what}`),
      `Authoritative sources: ${e.sources.map((s) => `[${s.name}](${s.url})`).join(", ")}`,
    ],
    nonGoals: [
      "Vulnerability scanning.",
      "Guessing lifecycle status without an authoritative, versioned source.",
      "Executing package managers, build tools, or network calls during scans.",
    ],
    exit: [
      "All child tasks are closed.",
      `Detector maturity is at least \`${e.tier === 1 ? "beta" : "experimental"}\`.`,
      "Precision on the independent corpus is ≥ 0.95.",
    ],
    tier: e.tier,
  };
}
