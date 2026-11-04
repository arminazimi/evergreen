/**
 * Every parser Evergreen exposes, registered for the fuzz suite in `parsers.test.ts`. Repository
 * contents are untrusted input, so each parser must tolerate arbitrary text without crashing,
 * hanging, or returning different results for the same input.
 *
 * `allowedErrors` lists the deliberate, typed errors a parser throws for malformed input: the
 * version-range and PURL parsers judge caller-supplied strings and reject them with their own
 * error classes, and the SBOM readers reject documents that are not a BOM. Any other error
 * escaping a parser fails the fuzz run.
 *
 * Budgets come from the environment so the nightly job can go deeper than `npm run check`:
 * `EVERGREEN_FUZZ_RUNS` sets the iterations per parser (default 100) and `EVERGREEN_FUZZ_MS`
 * the wall-clock limit per parser (default 5000). A target may lower its own iteration count
 * when one run reads files or loads bundled data.
 */
import { DiffError, parseRange } from "../../src/diff.js";
import { parseNpmPackage } from "../../src/guard.js";
import { parseMinSupportDays } from "../../src/min-support.js";
import { ConfigError, validateConfig } from "../../src/config.js";
import { parseBoundedJson } from "../../src/package-files.js";
import { PurlError, parsePurl } from "../../src/purl.js";
import { VersError, parseVers, parseVersLenient } from "../../src/vers.js";
import { parseCodeowners } from "../../src/codeowners.js";
import {
  matchesComposerConstraint,
  parsePhpVersion as parseComposerPhpVersion,
} from "../../src/upgrade/composer-lock.js";
import { matchesDartConstraint, parseTargetVersion as parseDartTargetVersion } from "../../src/upgrade/dart-sdk.js";
import { normalizeGoVersion, parseVendorModules } from "../../src/upgrade/go-modules.js";
import { parseUpgradeTarget } from "../../src/upgrade/index.js";
import { readPackages as readNpmUpgradePackages } from "../../src/upgrade/npm-lock.js";
import { matchesSpecifier, parseVersion as parsePep440Version } from "../../src/upgrade/pep440.js";
import { readPackages as readPnpmUpgradePackages } from "../../src/upgrade/pnpm-lock.js";
import { readJsonLines } from "../../src/detectors/json-lines.js";
import { setupDotnetVersions } from "../../src/detectors/github-actions-dotnet.js";
import { setupNodeVersions } from "../../src/detectors/github-actions-node.js";
import { parseAzurePipelines } from "../../src/detectors/ci-images/parse-azure-pipelines.js";
import { parseCircleci } from "../../src/detectors/ci-images/parse-circleci.js";
import { parseGitlabCi } from "../../src/detectors/ci-images/parse-gitlab-ci.js";
import { parseAndroidBuildGradle } from "../../src/detectors/android/parse-build-gradle.js";
import { parseAndroidLibsVersionsToml } from "../../src/detectors/android/parse-libs-versions-toml.js";
import { parseAndroidSettingsGradle } from "../../src/detectors/android/parse-settings-gradle.js";
import { parseConanfilePy, parseConanfileTxt } from "../../src/detectors/cpp/parse-conan.js";
import { parseCmakeLists } from "../../src/detectors/cpp/parse-cmakelists.js";
import { parseVcpkgJson } from "../../src/detectors/cpp/parse-vcpkg.js";
import { parseDatabaseCompose } from "../../src/detectors/database/parse-compose.js";
import { parseDatabaseTerraform } from "../../src/detectors/database/parse-terraform.js";
import { parseBunVersion, parseBunfig, parseDenoJson } from "../../src/detectors/deno/parse.js";
import { parseFvmConfigJson, parseFvmrc } from "../../src/detectors/dart/parse-fvm.js";
import { parsePubspec } from "../../src/detectors/dart/parse-pubspec.js";
import { parsePubspecLock } from "../../src/detectors/dart/parse-pubspec-lock.js";
import { parseGlobalJson } from "../../src/detectors/dotnet/parse-global-json.js";
import { parseMsbuild } from "../../src/detectors/dotnet/parse-msbuild.js";
import { parsePackagesLock } from "../../src/detectors/dotnet/parse-packages-lock.js";
import { parseToolVersions as parseToolVersionsElixir } from "../../src/detectors/elixir/parse-elixir-runtime.js";
import { parseMixExs } from "../../src/detectors/elixir/parse-mix-exs.js";
import { parseMixLock } from "../../src/detectors/elixir/parse-mix-lock.js";
import { parseGoMod } from "../../src/detectors/go/parse-go-mod.js";
import { parseGoWork } from "../../src/detectors/go/parse-go-work.js";
import { parseCompose } from "../../src/detectors/container/parse-compose.js";
import { parseDevcontainer } from "../../src/detectors/container/parse-devcontainer.js";
import { parseDockerfile } from "../../src/detectors/container/parse-dockerfile.js";
import { parseImageReference } from "../../src/detectors/container/parse-image.js";
import {
  parseGoVersion,
  parseJavaRelease,
  parseNodeVersionHeader,
  parseOsRelease,
} from "../../src/detectors/container/rootfs.js";
import { parseCatalog } from "../../src/detectors/java/parse-catalog.js";
import { parseGradle } from "../../src/detectors/java/parse-gradle.js";
import {
  parseJavaVersion,
  parseSdkmanrc,
  parseToolVersions as parseToolVersionsJava,
} from "../../src/detectors/java/parse-pins.js";
import { parsePom } from "../../src/detectors/java/parse-pom.js";
import { parseWrapper } from "../../src/detectors/java/parse-wrapper.js";
import { parseJdkVersion } from "../../src/detectors/java/jdk-version.js";
import { parseXml } from "../../src/detectors/java/xml.js";
import { parseKustomization } from "../../src/detectors/kubernetes/parse-kustomize.js";
import { parseManifest } from "../../src/detectors/kubernetes/parse-manifest.js";
import { parseChart, parseTemplate as parseTemplateHelm } from "../../src/detectors/kubernetes/parse-helm.js";
import { parseComposerJson } from "../../src/detectors/php/parse-composer-json.js";
import { parseComposerLock } from "../../src/detectors/php/parse-composer-lock.js";
import {
  parsePhpVersion,
  parseToolVersions as parseToolVersionsPhp,
} from "../../src/detectors/php/parse-php-runtime.js";
import { parsePowerShell } from "../../src/detectors/shell/parse-powershell.js";
import { parseWorkflow } from "../../src/detectors/shell/parse-workflow.js";
import { parseCargoLock } from "../../src/detectors/rust/parse-cargo-lock.js";
import { parseCargoToml } from "../../src/detectors/rust/parse-cargo-toml.js";
import { parseRustToolchain } from "../../src/detectors/rust/parse-rust-toolchain.js";
import { parseGemfile } from "../../src/detectors/ruby/parse-gemfile.js";
import { parseGemfileLock } from "../../src/detectors/ruby/parse-gemfile-lock.js";
import { parseGemspec } from "../../src/detectors/ruby/parse-gemspec.js";
import {
  parseRubyVersion,
  parseToolVersions as parseToolVersionsRuby,
} from "../../src/detectors/ruby/parse-ruby-runtime.js";
import { parseBuildProperties } from "../../src/detectors/scala/parse-build-properties.js";
import { parseBuildSbt } from "../../src/detectors/scala/parse-build-sbt.js";
import { parseScalaVersion } from "../../src/detectors/scala/parse-scala-version.js";
import { parseServerlessYml } from "../../src/detectors/serverless/parse-serverless-yml.js";
import { parseTemplate as parseTemplateServerless } from "../../src/detectors/serverless/parse-template.js";
import { parseTf } from "../../src/detectors/serverless/parse-tf.js";
import { parseManagedKubernetes } from "../../src/detectors/terraform/kubernetes.js";
import { parseTerraformFile, parseTerraformLegacy } from "../../src/detectors/terraform/parse-terraform.js";
import { parseTerraformLock } from "../../src/detectors/terraform/parse-lock.js";
import { parseTerraformPlanJson } from "../../src/detectors/terraform/plan.js";
import {
  parseToolVersionsTerraform,
  parseTerraformVersionFile,
} from "../../src/detectors/terraform/parse-version-files.js";
import { parsePackageResolved } from "../../src/detectors/swift/parse-package-resolved.js";
import { parsePackageSwift } from "../../src/detectors/swift/parse-package-swift.js";
import { parseSwiftVersion, parseXcodeVersion } from "../../src/detectors/swift/parse-swift-toolchain.js";
import { parseXcodeProjectIOSDeploymentTargets } from "../../src/detectors/swift/parse-xcode-project.js";
import { NpmDetector } from "../../src/detectors/npm.js";
import { PythonDetector } from "../../src/detectors/python.js";
import { parseExport, inventoryImporters } from "../../src/inventory/index.js";
import { parseOsReleaseDocument } from "../../src/inventory/os-release.js";
import { CycloneDxError, enrichCycloneDx } from "../../src/sbom/cyclonedx.js";
import { enrichSpdx, SpdxError as SpdxExportError } from "../../src/sbom/spdx.js";
import { scanCycloneDx, scanSpdx, SpdxError as SpdxScanError } from "../../src/sbom/input.js";
import { analyzeJavaScriptFile } from "../../src/usage/javascript.js";
import { analyzePythonFile } from "../../src/usage/python.js";
import type { Detector } from "../../src/sdk.js";

export interface ParserEntry {
  readonly name: string;
  readonly parse: (contents: string) => unknown;
  readonly allowedErrors?: readonly (new (message: string) => Error)[];
  /** Lower than the global budget when one run is expensive. */
  readonly runs?: number;
}

/** A parser whose input is a parsed JSON-shaped document rather than a string. */
export interface DocumentParserEntry {
  readonly name: string;
  readonly parse: (document: unknown) => unknown | Promise<unknown>;
  readonly allowedErrors?: readonly (new (message: string) => Error)[];
  readonly runs?: number;
}

/**
 * A detector reads files from a root directory. `seed` is written once, and the fuzzed string is
 * written to `file` before every run, so the target exercises the container format (manifest,
 * lockfile, project file) the detector parses without scanning unrelated files.
 */
export interface DetectorParserEntry {
  readonly name: string;
  readonly detector: Detector;
  readonly file: string;
  readonly seed?: Readonly<Record<string, string>>;
  readonly allowedErrors?: readonly (new (message: string) => Error)[];
  readonly runs?: number;
}

/** A source-code parser: its input is a file name, a language, and the source text. */
export interface SourceParserEntry {
  readonly name: string;
  readonly path: string;
  readonly parse: (source: string) => Promise<unknown>;
  readonly allowedErrors?: readonly (new (message: string) => Error)[];
  readonly runs?: number;
}

export const parsers: readonly ParserEntry[] = [
  { name: "parseRange", parse: parseRange, allowedErrors: [DiffError] },
  { name: "parseNpmPackage", parse: parseNpmPackage },
  { name: "parseMinSupportDays", parse: parseMinSupportDays },
  { name: "parsePurl", parse: parsePurl, allowedErrors: [PurlError] },
  { name: "parseVers", parse: parseVers, allowedErrors: [VersError] },
  { name: "parseVersLenient", parse: parseVersLenient, allowedErrors: [VersError] },
  { name: "parseCodeowners", parse: parseCodeowners },
  { name: "readJsonLines (strict)", parse: (contents) => readJsonLines(contents, { comments: false }) },
  { name: "readJsonLines (comments)", parse: (contents) => readJsonLines(contents, { comments: true }) },
  { name: "setupNodeVersions", parse: setupNodeVersions },
  { name: "setupDotnetVersions", parse: setupDotnetVersions },
  { name: "parseAzurePipelines", parse: parseAzurePipelines },
  { name: "parseCircleci", parse: parseCircleci },
  { name: "parseGitlabCi", parse: parseGitlabCi },
  { name: "parseAndroidBuildGradle", parse: parseAndroidBuildGradle },
  { name: "parseAndroidLibsVersionsToml", parse: parseAndroidLibsVersionsToml },
  { name: "parseAndroidSettingsGradle", parse: parseAndroidSettingsGradle },
  { name: "parseConanfileTxt", parse: parseConanfileTxt },
  { name: "parseConanfilePy", parse: parseConanfilePy },
  { name: "parseCmakeLists", parse: parseCmakeLists },
  { name: "parseVcpkgJson", parse: parseVcpkgJson },
  { name: "parseDatabaseCompose", parse: parseDatabaseCompose },
  { name: "parseDatabaseTerraform", parse: parseDatabaseTerraform },
  { name: "parseBunVersion", parse: parseBunVersion },
  { name: "parseBunfig", parse: parseBunfig },
  { name: "parseDenoJson", parse: parseDenoJson },
  { name: "parseFvmrc", parse: parseFvmrc },
  { name: "parseFvmConfigJson", parse: parseFvmConfigJson },
  { name: "parsePubspec", parse: parsePubspec },
  { name: "parsePubspecLock", parse: parsePubspecLock },
  { name: "parseGlobalJson", parse: parseGlobalJson },
  { name: "parseMsbuild", parse: parseMsbuild },
  { name: "parsePackagesLock", parse: parsePackagesLock },
  { name: "parseToolVersions (elixir)", parse: parseToolVersionsElixir },
  { name: "parseMixExs", parse: parseMixExs },
  { name: "parseMixLock", parse: parseMixLock },
  { name: "parseGoMod", parse: parseGoMod },
  { name: "parseGoWork", parse: parseGoWork },
  { name: "parseCompose", parse: parseCompose },
  { name: "parseDevcontainer", parse: parseDevcontainer },
  { name: "parseDockerfile", parse: parseDockerfile },
  { name: "parseImageReference", parse: parseImageReference },
  { name: "parseOsRelease", parse: parseOsRelease },
  { name: "parseNodeVersionHeader", parse: parseNodeVersionHeader },
  { name: "parseGoVersion", parse: parseGoVersion },
  { name: "parseJavaRelease", parse: parseJavaRelease },
  { name: "parseCatalog", parse: parseCatalog },
  { name: "parseGradle", parse: parseGradle },
  { name: "parseJavaVersion", parse: parseJavaVersion },
  { name: "parseSdkmanrc", parse: parseSdkmanrc },
  { name: "parseToolVersions (java)", parse: parseToolVersionsJava },
  { name: "parsePom", parse: parsePom },
  { name: "parseWrapper", parse: parseWrapper },
  { name: "parseJdkVersion", parse: parseJdkVersion },
  { name: "parseXml", parse: parseXml },
  { name: "parseKustomization", parse: parseKustomization },
  { name: "parseManifest", parse: parseManifest },
  { name: "parseChart", parse: parseChart },
  { name: "parseTemplate (helm)", parse: parseTemplateHelm },
  { name: "parseComposerJson", parse: parseComposerJson },
  { name: "parseComposerLock", parse: parseComposerLock },
  { name: "parsePhpVersion", parse: parsePhpVersion },
  { name: "parseToolVersions (php)", parse: parseToolVersionsPhp },
  { name: "parsePowerShell", parse: parsePowerShell },
  { name: "parseWorkflow", parse: parseWorkflow },
  { name: "parseCargoLock", parse: parseCargoLock },
  { name: "parseCargoToml", parse: parseCargoToml },
  { name: "parseRustToolchain", parse: parseRustToolchain },
  { name: "parseGemfile", parse: parseGemfile },
  { name: "parseGemfileLock", parse: parseGemfileLock },
  { name: "parseGemspec", parse: parseGemspec },
  { name: "parseRubyVersion", parse: parseRubyVersion },
  { name: "parseToolVersions (ruby)", parse: parseToolVersionsRuby },
  { name: "parseBuildProperties", parse: parseBuildProperties },
  { name: "parseBuildSbt", parse: parseBuildSbt },
  { name: "parseScalaVersion", parse: parseScalaVersion },
  { name: "parseServerlessYml", parse: parseServerlessYml },
  { name: "parseTemplate (serverless)", parse: parseTemplateServerless },
  { name: "parseTf", parse: parseTf },
  { name: "parseManagedKubernetes", parse: parseManagedKubernetes },
  { name: "parseTerraformFile", parse: parseTerraformFile },
  { name: "parseTerraformLegacy", parse: parseTerraformLegacy },
  { name: "parseTerraformLock", parse: parseTerraformLock },
  { name: "parseTerraformPlanJson", parse: parseTerraformPlanJson },
  { name: "parseTerraformVersionFile", parse: parseTerraformVersionFile },
  { name: "parseToolVersionsTerraform", parse: parseToolVersionsTerraform },
  { name: "parsePackageResolved", parse: parsePackageResolved },
  { name: "parsePackageSwift", parse: parsePackageSwift },
  { name: "parseSwiftVersion", parse: parseSwiftVersion },
  { name: "parseXcodeVersion", parse: parseXcodeVersion },
  { name: "parseXcodeProjectIOSDeploymentTargets", parse: parseXcodeProjectIOSDeploymentTargets },
  { name: "parseExport (inventory)", parse: parseExport },
  { name: "parseOsReleaseDocument (inventory)", parse: parseOsReleaseDocument },
  { name: "parseBoundedJson", parse: parseBoundedJson },
  { name: "parseUpgradeTarget", parse: parseUpgradeTarget },
  { name: "upgrade npm-lock readPackages", parse: readNpmUpgradePackages },
  { name: "upgrade pnpm-lock readPackages", parse: readPnpmUpgradePackages },
  { name: "upgrade parsePhpVersion (composer)", parse: parseComposerPhpVersion },
  { name: "upgrade matchesComposerConstraint", parse: (contents) => matchesComposerConstraint(contents, "1.0.0") },
  { name: "upgrade parseTargetVersion (dart)", parse: parseDartTargetVersion },
  { name: "upgrade matchesDartConstraint", parse: (contents) => matchesDartConstraint("1.0.0", contents) },
  { name: "upgrade parseVendorModules", parse: parseVendorModules },
  { name: "upgrade normalizeGoVersion", parse: normalizeGoVersion },
  { name: "upgrade parseVersion (pep440)", parse: parsePep440Version },
  { name: "upgrade matchesSpecifier (pep440)", parse: (contents) => matchesSpecifier(contents, "1.0.0") },
];

export const documentParsers: readonly DocumentParserEntry[] = [
  ...inventoryImporters.map(
    (importer): DocumentParserEntry => ({
      name: `inventory:${importer.id}`,
      parse: (document) => {
        const detected = importer.detect(document, "export.txt");
        return { detected, items: detected ? importer.items(document, "export.txt") : [] };
      },
    }),
  ),
  { name: "enrichCycloneDx", parse: (document) => enrichCycloneDx(document, []), allowedErrors: [CycloneDxError] },
  { name: "enrichSpdx", parse: (document) => enrichSpdx(document, []), allowedErrors: [SpdxExportError] },
  {
    name: "validateConfig",
    parse: (document) => validateConfig(document, ".evergreen.json"),
    allowedErrors: [ConfigError],
  },
  // These load bundled data for components with PURLs, so they get a smaller budget than pure transforms.
  { name: "scanCycloneDx", parse: scanCycloneDx, allowedErrors: [CycloneDxError], runs: 25 },
  { name: "scanSpdx", parse: scanSpdx, allowedErrors: [SpdxScanError], runs: 25 },
];

const NPM_SEED = {
  "package.json": JSON.stringify({ name: "fuzz-target", private: true, dependencies: { request: "^2.88.0" } }),
};

const PYTHON_SEED = {
  "pyproject.toml": '[project]\nname = "fuzz-target"\nrequires-python = ">=3.8"\n',
};

export const detectorParsers: readonly DetectorParserEntry[] = [
  {
    name: "npm package.json (workspace)",
    detector: new NpmDetector(),
    file: "packages/app/package.json",
    seed: { "package.json": JSON.stringify({ private: true, workspaces: ["packages/*"] }) },
  },
  { name: "npm package-lock.json", detector: new NpmDetector(), file: "package-lock.json", seed: NPM_SEED },
  { name: "npm npm-shrinkwrap.json", detector: new NpmDetector(), file: "npm-shrinkwrap.json", seed: NPM_SEED },
  { name: "npm pnpm-lock.yaml", detector: new NpmDetector(), file: "pnpm-lock.yaml", seed: NPM_SEED },
  { name: "npm yarn.lock", detector: new NpmDetector(), file: "yarn.lock", seed: NPM_SEED },
  { name: "npm bun.lock", detector: new NpmDetector(), file: "bun.lock", seed: NPM_SEED },
  {
    name: "python pyproject.toml",
    detector: new PythonDetector(),
    file: "pyproject.toml",
  },
  { name: "python requirements.txt", detector: new PythonDetector(), file: "requirements.txt", seed: PYTHON_SEED },
  { name: "python uv.lock", detector: new PythonDetector(), file: "uv.lock", seed: PYTHON_SEED },
  { name: "python poetry.lock", detector: new PythonDetector(), file: "poetry.lock", seed: PYTHON_SEED },
  { name: "python pdm.lock", detector: new PythonDetector(), file: "pdm.lock", seed: PYTHON_SEED },
  { name: "python Pipfile.lock", detector: new PythonDetector(), file: "Pipfile.lock", seed: PYTHON_SEED },
];

export const sourceParsers: readonly SourceParserEntry[] = [
  {
    name: "analyzeJavaScriptFile",
    path: "source.js",
    parse: (source) => analyzeJavaScriptFile({ path: "source.js", language: "javascript", source }, []),
  },
  {
    name: "analyzeTypeScriptFile",
    path: "source.ts",
    parse: (source) => analyzeJavaScriptFile({ path: "source.ts", language: "typescript", source }, []),
  },
  {
    name: "analyzePythonFile",
    path: "source.py",
    parse: (source) => analyzePythonFile({ path: "source.py", language: "python", source }, []),
  },
];
