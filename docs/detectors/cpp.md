{% raw %}
# C and C++

The `cpp` detector reports CMake policy floors that CMake has removed or deprecated, as declared in `cmake_minimum_required`, and matches Conan, vcpkg, language-standard, and compiler declarations when a reviewed rule covers them. It is **supported**: it is scored on the [public corpus](../VALIDATION.md) and held to the corpus precision and recall floors.

## What it reads

| File | Declaration |
| --- | --- |
| `CMakeLists.txt` | `cmake_minimum_required(VERSION <version>)`, `set(CMAKE_C_STANDARD <integer>)`, `set(CMAKE_CXX_STANDARD <integer>)`, and an `if` that names `CMAKE_<LANG>_COMPILER_ID` with `STREQUAL` and `CMAKE_<LANG>_COMPILER_VERSION` with a `VERSION_*` comparison |
| `conanfile.txt` | Each entry of the `[requires]` section, `name/version` |
| `conanfile.py` | The `requires` attribute and literal `self.requires(...)` calls |
| `vcpkg.json` | Top-level `builtin-baseline`, and each direct `dependencies` entry |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. CMake, Conan, and vcpkg are never run, and nothing is fetched.

## What it reports

- A `cmake_minimum_required` version that a `pkg:generic/cmake` rule contains. The bundled rules cover policy versions older than 3.5 (removed in CMake 4.0) and from 3.5 up to 3.10 (deprecated in CMake 3.31).
- A Conan requirement, a vcpkg `version>=` floor, a language standard, or a compiler comparison when a rule for that Package URL contains the version as written. There are no bundled rules for those yet.
- A vcpkg dependency with no `version>=`, only when a rule covers every version of that package.
- A `builtin-baseline` commit when a rule's range contains that string.

Each finding carries its rule's sources, replacement, migration steps, and verification commands. The detector reports no source usages.

## What it intentionally does not judge

- CMake generators and modules. The registry has rules for the Visual Studio 12 2013 generator, FindGDAL, and CMakeFindFrameworks, and the parser does not emit those declarations yet, so they produce no finding.
- Conan and vcpkg packages, language standards, compilers, and baselines with no rule. A missing finding is not evidence that a version is current.
- `cmake_minimum_required` written as a policy range (`VERSION 3.5...3.16`), a value read from a variable, or a generator expression.
- Conan `[tool_requires]` and `[build_requires]`, version ranges, and dynamic Python.
- Feature-scoped vcpkg dependencies and `overrides`.
- Vulnerability advisories and license policy.

## Known limits and false-positive boundaries

- A `version>=` floor is matched as that version, not as every version the constraint allows.
- A compiler check matches the compared version. `VERSION_LESS 9.3` is not read as "this project rejects compilers older than 9.3."
- Malformed input produces no declarations from that file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `build`, `vendor`, or another skipped directory, are not scanned.

## Data

The rules are in `registry/cpp.json` and ship in the [data bundle](../DATA.md). The `cpp-1` importer drafts CMake policy compatibility rules from the `cmake_minimum_required` page for review; see [Lifecycle importers](../IMPORTERS.md).

## Validation

The corpus holds 15 pinned C/C++ ecosystem repositories: eleven with reviewed findings in that folder and four with none (`catchorg/Catch2`, `j2kun/mlir-tutorial`, `rogerorr/NtTrace`, and `jagheterfredrik/meb-preheat`). Across every ecosystem the corpus expects 242 `cpp` findings in 20 repositories. Of the 15 C/C++ entries, 11 were selected blind (73%). Every expected finding was checked by reading its line at the pinned commit; notes cite maintainer migration commits or the CMake policy documentation rather than Evergreen's output. Method and selection rules are in [Validation](../VALIDATION.md).
{% endraw %}
