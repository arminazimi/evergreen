---
title: C and C++ detector
---

# C and C++ detector

The detector's supported declarations, package URLs, what it reports, what it intentionally does not judge, and the false-positive boundaries. The matrix and policy it belongs to are on [Compatibility](../COMPATIBILITY.md).

## C and C++ detector

The `cpp` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories are pinned in `benchmarks/public-repositories.json`: four targeted migration cases and one blind, zero-finding repository. Their ground truth cites maintainer migration commits or upstream release notes, independently of Evergreen output. Precision on this corpus does not establish coverage of unsupported declaration forms. Its lifecycle rules are in `registry/cpp.json` and ship in the [data bundle](../DATA.md).

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `CMakeLists.txt` | `cmake_minimum_required(VERSION <version>)`, `set(CMAKE_C_STANDARD <integer>)`, `set(CMAKE_CXX_STANDARD <integer>)`, and an `if` that names `CMAKE_<LANG>_COMPILER_ID` with `STREQUAL` and `CMAKE_<LANG>_COMPILER_VERSION` with a `VERSION_*` comparison | Values built at configure time, the policy-range form (`3.16...3.27`), `CACHE` / `PARENT_SCOPE` / `FORCE`, and checks combined with `OR` or `NOT` are ignored. |
| `conanfile.txt` | Each entry of the `[requires]` section, `name/version` | `@user/channel` and `#revision` are not versions. Other sections, including `[tool_requires]`, are ignored. Version ranges are ignored. |
| `conanfile.py` | The `requires` attribute and literal `self.requires(...)` calls | The file is untrusted Python and is never executed. f-strings, variables, and calls that span lines are ignored. `tool_requires` is not a direct requirement. |
| `vcpkg.json` | Top-level `builtin-baseline`, and each direct `dependencies` entry | A string dependency is a name. An object may also carry `version>=`. Feature-scoped dependencies, `overrides`, and the manifest's own `version` are ignored. |

Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. CMake, Conan, and vcpkg are never run, and nothing is fetched.

### Package URLs

`pkg:generic/cmake` is the identity the CMake policy importer writes. `conan` is the Package URL type, so a requirement is `pkg:conan/<name>` with the name as written. vcpkg has no importer yet, so a dependency is `pkg:vcpkg/<name>`. The other declarations are not packages: `pkg:generic/c-standard` and `pkg:generic/cxx-standard` for language standards, `pkg:generic/c-compiler/<id>` and `pkg:generic/cxx-compiler/<id>` for a compiler check (the compiler id is lowercased), and `pkg:generic/vcpkg-baseline` for a baseline commit.

### What it reports

- A `cmake_minimum_required` version that a `pkg:generic/cmake` rule contains. The bundled rules cover policy versions older than 3.5 (removed in CMake 4.0) and from 3.5 up to 3.10 (deprecated in CMake 3.31).
- A Conan requirement, a vcpkg `version>=` floor, a language standard, or a compiler comparison when a rule for that Package URL contains the version as written. There are no bundled rules for those yet.
- A vcpkg dependency with no `version>=`, only when a rule covers every version of that package.
- A `builtin-baseline` commit when a rule's range contains that string. A semver range does not contain a commit. A rule that covers every version does.

The first matching rule wins. A rule whose VERS is malformed, or whose comparison throws, is skipped and does not hide a later rule. Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands.

### What it intentionally does not judge

- CMake generators and modules. The registry has rules for the Visual Studio 12 2013 generator, FindGDAL, and CMakeFindFrameworks, and the parser does not emit those declarations yet, so they produce no finding.
- Conan and vcpkg packages, language standards, compilers, and baselines with no rule. A missing finding is not evidence that a version is current.
- `cmake_minimum_required` written as a policy range (`VERSION 3.5...3.16`), a value read from a variable, or a generator expression.
- Conan `[tool_requires]` and `[build_requires]`, version ranges, and dynamic Python.
- Feature-scoped vcpkg dependencies and `overrides`.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A `version>=` floor is matched as that version, not as every version the constraint allows. A floor inside a rule is reported even when a newer resolution would sit outside it.
- A compiler check matches the compared version. `VERSION_LESS 9.3` is not read as "this project rejects compilers older than 9.3."
- A baseline commit matches a rule that covers every version, because that range does not inspect the commit.
- Malformed input produces no declarations from that file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `build`, `vendor`, or another skipped directory, are not scanned.
