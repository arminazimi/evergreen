import { test } from "node:test";

import { checkRoundTrip, checkToleratesArbitraryText, type RoundTripCase } from "./harness.js";

/**
 * Property tests for the lockfile and dependency-manifest parsers: the files that name a package
 * and the version resolved or required for it. Each case writes one canonical file, so a valid
 * manifest must always give back exactly what it declares, and arbitrary text must never crash.
 */

const CASES: readonly RoundTripCase[] = [
  {
    name: "parseCargoLock",
    file: ({ name, version }) =>
      `version = 3\n\n[[package]]\nname = "${name}"\nversion = "${version}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseCargoToml",
    file: ({ name, version }) =>
      `[package]\nname = "demo"\nversion = "0.1.0"\n\n[dependencies]\n${name} = "${version}"\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseGemfileLock",
    file: ({ name, version }) =>
      `GEM\n  remote: https://rubygems.org/\n  specs:\n    ${name} (${version})\n\nPLATFORMS\n  ruby\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseGemfile",
    file: ({ name, version }) => `source "https://rubygems.org"\ngem "${name}", "${version}"\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseGemspec",
    file: () => 'Gem::Specification.new do |spec|\n  spec.required_ruby_version = ">= 3.1.0"\nend\n',
    names: "zzmark",
    versions: "9.8.7",
    markers: () => [">= 3.1.0"],
  },
  {
    name: "parseMixLock",
    file: ({ name, version }) => `  "${name}": {:hex, :${name}, "${version}", "aaa", [:mix], [], "hexpm", "bbb"},\n`,
    names: "zphoenixx",
    versions: "9.8.7",
  },
  {
    name: "parseMixExs",
    file: ({ name, version }) =>
      `defmodule Demo.MixProject do\n  def project do\n    [\n      elixir: "~> 1.15",\n      deps: [\n        {:${name}, "${version}"}\n      ]\n    ]\n  end\nend\n`,
    names: "zzmark",
    versions: ">= 9.8.0",
    markers: () => ["zzmark", "~> 1.15"],
  },
  {
    name: "parsePackagesLock",
    file: ({ name, version }) =>
      `{"version":1,"dependencies":{"net6.0":{"${name}":{"type":"Direct","requested":"[${version}, )","resolved":"${version}"}}}}\n`,
    names: "zzmark",
    versions: "9.8.7",
    markers: ({ name, version }) => [name, version],
  },
  {
    name: "parseVcpkgJson",
    file: ({ name, version }) => `{"dependencies":[{"name":"${name}","version":"${version}"}]}\n`,
    names: "zzmark",
    versions: "9.8.7",
    markers: ({ name }) => [name],
  },
  {
    name: "parseConanfileTxt",
    file: ({ name, version }) => `[requires]\n${name}/${version}\n`,
    names: "zlib",
    versions: "9.8.7",
    markers: () => ["zlib", "9.8.7"],
  },
  {
    name: "parseConanfilePy",
    file: ({ name, version }) =>
      `from conan import ConanFile\n\nclass Demo(ConanFile):\n    requires = "${name}/${version}"\n`,
    names: "zlib",
    versions: "9.8.7",
    markers: () => ["zlib", "9.8.7"],
  },
  {
    name: "parsePubspec",
    file: ({ version }) => `name: demo\nenvironment:\n  sdk: "${version}"\n`,
    names: "demo",
    versions: ">=3.0.0 <4.0.0",
    markers: () => [">=3.0.0 <4.0.0"],
  },
  {
    name: "parsePubspecLock",
    file: ({ name, version }) =>
      `packages:\n  ${name}:\n    dependency: "direct main"\n    description: hosted\n    source: hosted\n    version: "${version}"\n`,
    names: "collection",
    versions: "9.8.7",
    markers: () => ["collection", "9.8.7"],
  },
  {
    name: "parseComposerJson",
    file: ({ name, version }) => `{"require":{"${name}":"${version}"}}\n`,
    names: "symfony/zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseComposerLock",
    file: ({ name, version }) =>
      `{"packages":[{"name":"${name}","version":"${version}"}],"platform":{"php":"8.1.2"}}\n`,
    names: "zzmark/pkg",
    versions: "9.8.7",
  },
  {
    name: "parsePackageResolved",
    file: ({ name, version }) =>
      `{"version":2,"pins":[{"identity":"${name}","kind":"remoteSource","location":"https://github.com/apple/${name}.git","state":{"revision":"aaa","version":"${version}"}}]}\n`,
    names: "zzmark-log",
    versions: "9.8.7",
  },
  {
    name: "parsePackageSwift",
    file: ({ version }) =>
      `// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(\n    dependencies: [\n        .package(url: "https://github.com/apple/swift-log.git", from: "${version}")\n    ]\n)\n`,
    names: "swift-log",
    versions: "9.8.7",
    markers: ({ name, version }) => [`https://github.com/apple/${name}.git`, version, "5.9"],
  },
  {
    name: "parseGoMod",
    file: ({ name, version }) =>
      `module example.com/${name}\n\ngo 1.21\n\nrequire (\n\texample.com/${name} ${version}\n)\n`,
    names: "zzmark",
    versions: "v9.8.7",
    markers: ({ name, version }) => [`example.com/${name}`, version],
  },
  {
    name: "parseGoWork",
    file: ({ name }) => `go 1.21\n\nuse ./${name}\n`,
    names: "zzmark",
    versions: "9.8.7",
    markers: () => ["1.21"],
  },
  {
    name: "parsePom",
    file: ({ name, version }) =>
      `<?xml version="1.0"?><project><dependencies><dependency><groupId>com.example</groupId><artifactId>${name}</artifactId><version>${version}</version></dependency></dependencies></project>\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseGradle",
    file: ({ name, version }) => `dependencies {\n    implementation "com.example:${name}:${version}"\n}\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseCatalog",
    file: ({ name, version }) =>
      `[versions]\nlib = "${version}"\n\n[libraries]\n${name} = { group = "com.example", name = "${name}", version.ref = "lib" }\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseAndroidBuildGradle",
    file: ({ version }) => `android {\n    compileSdk ${version}\n    defaultConfig {\n        minSdk 21\n    }\n}\n`,
    names: "agp",
    versions: "34",
    markers: () => ["34", "21"],
  },
  {
    name: "parseAndroidLibsVersionsToml",
    file: ({ version }) => `[versions]\nappcompat = "1.6.1"\n\nagp = "${version}"\n`,
    names: "agp",
    versions: "9.8.7",
    markers: () => ["9.8.7"],
  },
  {
    name: "parseAndroidSettingsGradle",
    file: ({ version }) =>
      `pluginManagement {\n    plugins {\n        id "com.android.application" version "${version}" apply false\n    }\n}\n`,
    names: "agp",
    versions: "9.8.7",
    markers: () => ["9.8.7"],
  },
  {
    name: "upgrade npm-lock readPackages",
    file: ({ name, version }) =>
      `{"lockfileVersion":3,"packages":{"node_modules/${name}":{"name":"${name}","version":"${version}","engines":{"node":">=18"}}}}\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "upgrade pnpm-lock readPackages",
    file: ({ name, version }) =>
      `lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      ${name}:\n        specifier: ^${version}\n        version: ${version}\n\npackages:\n  ${name}@${version}:\n    engines: {node: '>=18.18.0'}\n`,
    names: "zzmark",
    versions: "9.8.7",
    markers: ({ name, version }) => [`${name}@${version}`],
  },
  {
    name: "upgrade parseVendorModules",
    file: ({ name, version }) => `# ${name} ${version}\n## explicit; go 1.21\n`,
    names: "example.com/zzmark",
    versions: "v9.8.7",
  },
];

for (const target of CASES) {
  test(`${target.name} round-trips a canonical manifest or lockfile`, () => {
    checkRoundTrip(target);
  });
}

test("every manifest and lockfile parser tolerates arbitrary text", () => {
  for (const target of CASES) checkToleratesArbitraryText(target.name);
});
