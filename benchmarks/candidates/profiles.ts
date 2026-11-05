// Ordered before discovery; no version-specific or finding-specific queries.
export const profiles = {
  android: ["build.gradle", "build.gradle.kts"],
  "ci-images": ["azure-pipelines.yml", ".github/workflows/*.yml", ".github/workflows/*.yaml"],
  container: ["Dockerfile", "compose.yml", "docker-compose.yml"],
  cpp: ["CMakeLists.txt", "vcpkg.json"],
  dart: ["pubspec.yaml"],
  database: ["compose.yml", "docker-compose.yml", "*.tf"],
  deno: ["deno.json", "deno.jsonc", ".bun-version"],
  dotnet: ["*.csproj", "*.fsproj", "*.vbproj", "global.json"],
  elixir: ["mix.exs", "mix.lock", ".tool-versions"],
  go: ["go.mod"],
  java: ["pom.xml", "build.gradle", "build.gradle.kts", ".java-version"],
  kubernetes: ["Chart.yaml", "kustomization.yaml"],
  node: ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"],
  "node-actions": [".github/workflows/*.yml", ".github/workflows/*.yaml", "action.yml"],
  php: ["composer.json", "composer.lock"],
  python: ["pyproject.toml", "requirements*.txt", "setup.cfg", ".python-version"],
  ruby: ["Gemfile", "Gemfile.lock", ".ruby-version"],
  rust: ["Cargo.toml", "rust-toolchain.toml", "rust-toolchain"],
  scala: ["build.sbt", "build.properties"],
  serverless: ["serverless.yml", "template.yaml", "*.tf"],
  shell: ["*.ps1", "*.psm1", "*.psd1"],
  swift: ["Package.swift", "project.pbxproj", ".swift-version"],
  terraform: ["*.tf"],
} as const;

export type Ecosystem = keyof typeof profiles;
export const ecosystems = Object.keys(profiles) as Ecosystem[];

export function matchesForm(path: string, form: string): boolean {
  const expression = form
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`(?:^|/)${expression}$`).test(path);
}

export function queryPlan() {
  return ecosystems.map((ecosystem) => ({
    ecosystem,
    forms: profiles[ecosystem].map((form) => ({
      form,
      query: `filename:${form.split("/").at(-1)} fork:false`,
    })),
    sizeBandsKb: [
      [0, 5000],
      [5001, 50000],
    ],
  }));
}
