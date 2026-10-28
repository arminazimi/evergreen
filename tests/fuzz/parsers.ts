/**
 * Every parser Evergreen exposes, registered for the fuzz suite in `parsers.test.ts`. Repository
 * contents are untrusted input, so each parser must tolerate arbitrary text without crashing,
 * hanging, or returning different results for the same input.
 *
 * `allowedErrors` lists the deliberate, typed errors a parser throws for malformed input: the
 * version-range and PURL parsers judge caller-supplied strings and reject them with their own
 * error classes. Any other error escaping a parser fails the fuzz run.
 *
 * Budgets come from the environment so the nightly job can go deeper than `npm run check`:
 * `EVERGREEN_FUZZ_RUNS` sets the iterations per parser (default 100) and `EVERGREEN_FUZZ_MS`
 * the wall-clock limit per parser (default 5000).
 */
import { DiffError, parseRange } from "../../src/diff.js";
import { parseNpmPackage } from "../../src/guard.js";
import { parseMinSupportDays } from "../../src/min-support.js";
import { PurlError, parsePurl } from "../../src/purl.js";
import { VersError, parseVers, parseVersLenient } from "../../src/vers.js";
import { parseCodeowners } from "../../src/codeowners.js";
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
import { parseJavaVersion, parseSdkmanrc, parseToolVersions as parseToolVersionsJava } from "../../src/detectors/java/parse-pins.js";
import { parsePom } from "../../src/detectors/java/parse-pom.js";
import { parseWrapper } from "../../src/detectors/java/parse-wrapper.js";
import { parseJdkVersion } from "../../src/detectors/java/jdk-version.js";
import { parseXml } from "../../src/detectors/java/xml.js";
import { parseKustomization } from "../../src/detectors/kubernetes/parse-kustomize.js";
import { parseManifest } from "../../src/detectors/kubernetes/parse-manifest.js";
import { parseChart, parseTemplate as parseTemplateHelm } from "../../src/detectors/kubernetes/parse-helm.js";
import { parseComposerJson } from "../../src/detectors/php/parse-composer-json.js";
import { parseComposerLock } from "../../src/detectors/php/parse-composer-lock.js";
import { parsePhpVersion, parseToolVersions as parseToolVersionsPhp } from "../../src/detectors/php/parse-php-runtime.js";
import { parsePowerShell } from "../../src/detectors/shell/parse-powershell.js";
import { parseWorkflow } from "../../src/detectors/shell/parse-workflow.js";
import { parseCargoLock } from "../../src/detectors/rust/parse-cargo-lock.js";
import { parseCargoToml } from "../../src/detectors/rust/parse-cargo-toml.js";
import { parseRustToolchain } from "../../src/detectors/rust/parse-rust-toolchain.js";
import { parseGemfile } from "../../src/detectors/ruby/parse-gemfile.js";
import { parseGemfileLock } from "../../src/detectors/ruby/parse-gemfile-lock.js";
import { parseGemspec } from "../../src/detectors/ruby/parse-gemspec.js";
import { parseRubyVersion, parseToolVersions as parseToolVersionsRuby } from "../../src/detectors/ruby/parse-ruby-runtime.js";
import { parseBuildProperties } from "../../src/detectors/scala/parse-build-properties.js";
import { parseBuildSbt } from "../../src/detectors/scala/parse-build-sbt.js";
import { parseScalaVersion } from "../../src/detectors/scala/parse-scala-version.js";
import { parseServerlessYml } from "../../src/detectors/serverless/parse-serverless-yml.js";
import { parseTemplate as parseTemplateServerless } from "../../src/detectors/serverless/parse-template.js";
import { parseTf } from "../../src/detectors/serverless/parse-tf.js";
import { parseManagedKubernetes } from "../../src/detectors/terraform/kubernetes.js";
import { parseTerraformFile } from "../../src/detectors/terraform/parse-terraform.js";
import { parseTerraformLock } from "../../src/detectors/terraform/parse-lock.js";
import { parseTerraformPlanJson } from "../../src/detectors/terraform/plan.js";
import { parseToolVersionsTerraform, parseTerraformVersionFile } from "../../src/detectors/terraform/parse-version-files.js";
import { parsePackageResolved } from "../../src/detectors/swift/parse-package-resolved.js";
import { parsePackageSwift } from "../../src/detectors/swift/parse-package-swift.js";
import { parseSwiftVersion, parseXcodeVersion } from "../../src/detectors/swift/parse-swift-toolchain.js";
import { parseXcodeProjectIOSDeploymentTargets } from "../../src/detectors/swift/parse-xcode-project.js";

export interface ParserEntry {
  readonly name: string;
  readonly parse: (contents: string) => unknown;
  readonly allowedErrors?: readonly (new (message: string) => Error)[];
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
  { name: "parseTerraformLock", parse: parseTerraformLock },
  { name: "parseTerraformPlanJson", parse: parseTerraformPlanJson },
  { name: "parseTerraformVersionFile", parse: parseTerraformVersionFile },
  { name: "parseToolVersionsTerraform", parse: parseToolVersionsTerraform },
  { name: "parsePackageResolved", parse: parsePackageResolved },
  { name: "parsePackageSwift", parse: parsePackageSwift },
  { name: "parseSwiftVersion", parse: parseSwiftVersion },
  { name: "parseXcodeVersion", parse: parseXcodeVersion },
  { name: "parseXcodeProjectIOSDeploymentTargets", parse: parseXcodeProjectIOSDeploymentTargets },
];
