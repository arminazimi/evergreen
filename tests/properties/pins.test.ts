import { test } from "node:test";

import { checkRoundTrip, checkToleratesArbitraryText, type RoundTripCase } from "./harness.js";

/**
 * Property tests for the files that pin a runtime or a tool: version-manager pins, container base
 * images, CI runner images, and single-version tool configuration files.
 *
 * Most of these name their tool by which file they are, so the parser reports the pinned version and
 * nothing else; those cases say `reports: "version"`. Where a parser carries more, the markers spell
 * it out, because the formats differ: a `.tool-versions` entry keeps the vendor prefix, a Dockerfile
 * keeps `name:tag` as one value, and an image reference comes back split into registry, repository,
 * and tag.
 */

const IMAGE_NAMES = "zzka9|znode|zquay.io/zzmark/demo|localhost:5000/zzmark/demo";
/** Fully-qualified references, whose repository path the parser reports unchanged. */
const QUALIFIED_IMAGES = "zquay.io/zzmark/demo|localhost:5000/zzmark/demo|registry.example.com/zzmark/demo";

/** The JDK feature release a version text names: `9.8.7` is release 9, `17` is release 17. */
function featureRelease(version: string): string {
  const [major = version] = version.split(".");
  return major;
}

const CASES: readonly RoundTripCase[] = [
  // Runtime pins.
  {
    name: "parseJavaVersion",
    file: ({ version }) => `${version}\n`,
    names: "java",
    versions: "9.8.7|17",
    reports: "version",
  },
  {
    name: "parseSdkmanrc",
    file: ({ version }) => `java=${version}\n`,
    names: "java",
    versions: "9.8.7-tem",
    markers: () => ["9.8.7-tem", "9"],
  },
  {
    name: "parseToolVersions (java)",
    file: ({ name, version }) => `java ${name}-${version}\n`,
    names: "temurin",
    versions: "9.8.7",
    markers: ({ name, version }) => [`${name}-${version}`, "9"],
  },
  {
    name: "parseJdkVersion",
    file: ({ version }) => version,
    names: "java",
    versions: "9.8.7|17",
    markers: ({ version }) => [featureRelease(version)],
  },
  {
    name: "parseRubyVersion",
    file: ({ version }) => `${version}\n`,
    names: "ruby",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseToolVersions (ruby)",
    file: ({ version }) => `ruby ${version}\n`,
    names: "ruby",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parsePhpVersion",
    file: ({ version }) => `${version}\n`,
    names: "php",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseToolVersions (php)",
    file: ({ version }) => `php ${version}\n`,
    names: "php",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseToolVersions (elixir)",
    file: ({ version }) => `elixir ${version}\nerlang 26.1.2\n`,
    names: "elixir",
    versions: "9.8.7",
    markers: () => ["9.8.7", "26.1.2"],
  },
  {
    name: "parseSwiftVersion",
    file: ({ version }) => `${version}\n`,
    names: "swift",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseXcodeVersion",
    file: ({ version }) => `${version}\n`,
    names: "xcode",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseRustToolchain",
    file: ({ version }) => `${version}\n`,
    names: "rust",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseScalaVersion",
    file: ({ version }) => `${version}\n`,
    names: "scala",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseTerraformVersionFile",
    file: ({ version }) => `${version}\n`,
    names: "terraform",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseToolVersionsTerraform",
    file: ({ version }) => `terraform ${version}\n`,
    names: "terraform",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseFvmrc",
    file: ({ version }) => `{"flutter":"${version}"}\n`,
    names: "flutter",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseFvmConfigJson",
    file: ({ version }) => `{"flutterSdkVersion":"${version}"}\n`,
    names: "flutter",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseBunVersion",
    file: ({ version }) => `${version}\n`,
    names: "bun",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseBunfig",
    file: ({ version }) => `[install]\nversion = "${version}"\n`,
    names: "bun",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseDenoJson",
    file: ({ version }) => `{"runtime":{"deno":"${version}"}}\n`,
    names: "deno",
    versions: "9.8.7",
    reports: "version",
  },
  { name: "parseBuildProperties", file: ({ version }) => `sbt.version=${version}\n`, names: "sbt", versions: "9.8.7" },
  { name: "parseBuildSbt", file: ({ version }) => `scalaVersion := "${version}"\n`, names: "scala", versions: "9.8.7" },
  {
    name: "parseGlobalJson",
    file: ({ version }) => `{"sdk":{"version":"${version}"}}\n`,
    names: "dotnet",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parsePowerShell",
    file: ({ version }) => `#Requires -Version ${version}\n`,
    names: "powershell",
    versions: "9.8",
    reports: "version",
  },

  // Container images and rootfs evidence.
  {
    name: "parseDockerfile",
    file: ({ name, version }) => `FROM ${name}:${version} AS base\nRUN echo hi\n`,
    names: IMAGE_NAMES,
    versions: "9.8.7",
    markers: ({ name, version }) => [`${name}:${version}`],
  },
  {
    name: "parseCompose",
    file: ({ name, version }) => `services:\n  app:\n    image: ${name}:${version}\n`,
    names: IMAGE_NAMES,
    versions: "9.8.7",
    markers: ({ name, version }) => [`${name}:${version}`],
  },
  {
    name: "parseDevcontainer",
    file: ({ name, version }) => `{"image":"${name}:${version}"}\n`,
    names: IMAGE_NAMES,
    versions: "9.8.7",
    markers: ({ name, version }) => [`${name}:${version}`],
  },
  {
    name: "parseImageReference",
    file: ({ name, version }) => `${name}:${version}`,
    names: QUALIFIED_IMAGES,
    versions: "9.8.7",
    markers: ({ version }) => [version, "zzmark/demo"],
  },
  {
    name: "parseOsRelease",
    file: ({ version }) => `ID=zzmark\nVERSION_ID="${version}"\nPRETTY_NAME="zzmark ${version}"\n`,
    names: "os",
    versions: "9.8",
    markers: () => ["zzmark", "9.8"],
  },
  {
    name: "parseNodeVersionHeader",
    file: ({ version }) => {
      const [major = "", minor = "", patch = ""] = version.split(".");
      return `#define NODE_MAJOR_VERSION ${major}\n#define NODE_MINOR_VERSION ${minor}\n#define NODE_PATCH_VERSION ${patch}\n`;
    },
    names: "node",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseGoVersion",
    file: ({ version }) => `go${version}\n`,
    names: "go",
    versions: "9.8.7|1.21",
    reports: "version",
  },
  {
    name: "parseJavaRelease",
    file: ({ version }) => `JAVA_VERSION="${version}"\n`,
    names: "java",
    versions: "9.8.7",
    reports: "version",
  },

  // CI images and setup steps.
  {
    name: "parseGitlabCi",
    file: ({ name, version }) => `build:\n  image: ${name}:${version}\n  script:\n    - make\n`,
    names: IMAGE_NAMES,
    versions: "9.8.7",
    markers: ({ name, version }) => [`${name}:${version}`],
  },
  {
    name: "parseCircleci",
    file: ({ name, version }) =>
      `version: 2.1\njobs:\n  build:\n    docker:\n      - image: ${name}:${version}\n    steps:\n      - checkout\n`,
    names: IMAGE_NAMES,
    versions: "9.8.7",
    markers: ({ name, version }) => [`${name}:${version}`],
  },
  {
    name: "parseAzurePipelines",
    file: ({ name }) => `pool:\n  vmImage: ${name}\nsteps:\n  - task: UseNode@1\n    inputs:\n      version: 20.11.1\n`,
    names: "ubuntu-22.04|ubuntu-24.04|macos-14",
    versions: "9.8.7",
    markers: ({ name }) => [name],
  },
  {
    name: "setupNodeVersions",
    file: ({ version }) =>
      `jobs:\n  build:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${version}\n`,
    names: "node",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "setupDotnetVersions",
    file: ({ version }) =>
      `jobs:\n  build:\n    steps:\n      - uses: actions/setup-dotnet@v4\n        with:\n          dotnet-version: ${version}\n`,
    names: "dotnet",
    versions: "9.8.7",
    reports: "version",
  },
  {
    name: "parseWorkflow",
    file: ({ version }) =>
      `name: ci\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    container:\n      image: mcr.microsoft.com/powershell:${version}\n    steps:\n      - run: pwsh build.ps1\n        shell: pwsh\n`,
    names: "powershell",
    versions: "7.3",
    markers: () => ["7.3", "pwsh"],
  },

  // Build definitions that name a toolchain or a minimum version.
  {
    name: "parseCmakeLists",
    file: ({ version }) => `cmake_minimum_required(VERSION ${version})\nproject(demo LANGUAGES CXX)\n`,
    names: "cmake",
    versions: "3.16",
    reports: "version",
  },
  {
    name: "parseWrapper",
    file: ({ name, version }) =>
      `distributionUrl=https\\://services.gradle.org/distributions/gradle-${version}-${name}.zip\n`,
    names: "bin|all",
    versions: "9.8.7",
    markers: ({ name, version }) => [
      version,
      `https://services.gradle.org/distributions/gradle-${version}-${name}.zip`,
    ],
  },
];

for (const target of CASES) {
  test(`${target.name} round-trips a canonical pin`, () => {
    checkRoundTrip(target);
  });
}

test("every pin and image parser tolerates arbitrary text", () => {
  for (const target of CASES) checkToleratesArbitraryText(target.name);
});
