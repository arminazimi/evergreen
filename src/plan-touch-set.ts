import type { Finding } from "./domain.js";

/**
 * Repository paths known to exist. Plan builders pass coverage or a file listing so this
 * function stays synchronous and never reads or executes repository contents.
 */
export interface TouchSetContext {
  /** Repository-relative paths, written with forward slashes. */
  readonly files: readonly string[];
}

/** Repo-relative path with forward slashes on every platform. */
function repoPath(path: string): string {
  return path.replaceAll("\\", "/");
}

/** Lockfiles that sit next to (or above) an npm-family manifest. */
const NPM_LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
] as const;

const PYTHON_LOCKFILES = ["uv.lock", "poetry.lock", "pdm.lock", "Pipfile.lock"] as const;

/** Manifest basename → lockfile basenames that may resolve its dependencies. */
const LOCKFILES_BY_MANIFEST: Readonly<Record<string, readonly string[]>> = {
  "package.json": NPM_LOCKFILES,
  "pyproject.toml": PYTHON_LOCKFILES,
  Pipfile: PYTHON_LOCKFILES,
  "go.mod": ["go.sum"],
  "Cargo.toml": ["Cargo.lock"],
  "composer.json": ["composer.lock"],
  Gemfile: ["Gemfile.lock"],
  "pubspec.yaml": ["pubspec.lock"],
  "mix.exs": ["mix.lock"],
  "Directory.Packages.props": ["packages.lock.json"],
};

/** Lockfile basename → manifest basenames that declare what it resolves. */
const MANIFESTS_BY_LOCKFILE: Readonly<Record<string, readonly string[]>> = {
  "package-lock.json": ["package.json"],
  "npm-shrinkwrap.json": ["package.json"],
  "pnpm-lock.yaml": ["package.json"],
  "yarn.lock": ["package.json"],
  "bun.lock": ["package.json"],
  "bun.lockb": ["package.json"],
  "uv.lock": ["pyproject.toml", "Pipfile"],
  "poetry.lock": ["pyproject.toml"],
  "pdm.lock": ["pyproject.toml"],
  "Pipfile.lock": ["Pipfile", "pyproject.toml"],
  "go.sum": ["go.mod"],
  "Cargo.lock": ["Cargo.toml"],
  "composer.lock": ["composer.json"],
  "Gemfile.lock": ["Gemfile"],
  "pubspec.lock": ["pubspec.yaml"],
  "mix.lock": ["mix.exs"],
  "packages.lock.json": ["Directory.Packages.props"],
};

function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function directory(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function joinPosix(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

/** Same derivation as the private helper in migration-packet: declaration plus usage files. */
function packetAffectedFiles(finding: Finding): string[] {
  return [
    finding.location.path,
    ...(finding.usages ?? []).map((usage) => usage.location.path),
  ];
}

function lockNamesForManifest(name: string): readonly string[] | undefined {
  if (LOCKFILES_BY_MANIFEST[name]) return LOCKFILES_BY_MANIFEST[name];
  if (/^requirements.*\.txt$/i.test(name)) return PYTHON_LOCKFILES;
  return undefined;
}

/**
 * Lockfiles that resolve `manifestPath`, searching that directory then parents up to the
 * repository root. The first directory that holds any matching lockfile wins, matching how
 * npm, pnpm, and Yarn keep one shared lockfile at the workspace root.
 */
function lockfilesForManifest(manifestPath: string, present: ReadonlySet<string>): string[] {
  const lockNames = lockNamesForManifest(basename(manifestPath));
  if (!lockNames) return [];
  let dir = directory(manifestPath);
  while (true) {
    const found = lockNames
      .map((name) => joinPosix(dir, name))
      .filter((candidate) => present.has(candidate));
    if (found.length > 0) return found;
    if (dir === "") return [];
    dir = directory(dir);
  }
}

function manifestsForLockfile(lockPath: string, present: ReadonlySet<string>): string[] {
  const manifestNames = MANIFESTS_BY_LOCKFILE[basename(lockPath)];
  if (!manifestNames) return [];
  const dir = directory(lockPath);
  return manifestNames
    .map((name) => joinPosix(dir, name))
    .filter((candidate) => present.has(candidate));
}

/**
 * Repository-relative paths a migration for `finding` is expected to edit: the finding's own
 * file, every packet affected file (declaration plus source usages), and for a dependency
 * finding both the manifest and its lockfile so two findings that share a lockfile conflict.
 *
 * Paths are de-duplicated, sorted, and written with forward slashes on every platform.
 */
export function touchSet(finding: Finding, context: TouchSetContext): string[] {
  const present = new Set(context.files.map((path) => repoPath(path)));
  const paths = new Set<string>();

  for (const path of packetAffectedFiles(finding)) {
    paths.add(repoPath(path));
  }

  const primary = repoPath(finding.location.path);
  const name = basename(primary);

  if (lockNamesForManifest(name)) {
    for (const lock of lockfilesForManifest(primary, present)) {
      paths.add(lock);
    }
  } else if (MANIFESTS_BY_LOCKFILE[name]) {
    for (const manifest of manifestsForLockfile(primary, present)) {
      paths.add(manifest);
    }
  }

  return [...paths].sort((left, right) => left.localeCompare(right));
}
