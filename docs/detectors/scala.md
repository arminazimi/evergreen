# Scala and sbt

The `scala` detector reports Scala and sbt releases that no longer receive maintenance, as declared in `.scala-version`, `build.sbt`, and `project/build.properties`. It is **experimental**: it is not yet held to the precision floor that stable detectors are (see [Decision 0013](../decisions/0013-detector-maturity.md)). Its lifecycle rules are in `registry/scala.json` and ship with the package (see [Lifecycle data](../DATA.md)).

## What it reads

| File | Declaration |
| --- | --- |
| `.scala-version` | A single pinned Scala version on a line by itself |
| `build.sbt` | A literal `scalaVersion := "…"`, `ThisBuild / scalaVersion := "…"`, or `scalaVersion in ThisBuild := "…"` |
| `project/build.properties` | An `sbt.version=…` pin |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `.bloop`, `.metals`, `.scala-build`, `fixtures`, `__fixtures__`, and `testdata`. A `build.properties` file is read only when its parent directory is named `project`. Scala and sbt are never run, and nothing is fetched.

## What it reports

- A Scala 2.11 version pinned in `.scala-version` or as an exact `scalaVersion` value in `build.sbt`. The [Scala development guarantees](https://scala-lang.org/development/) page states that Scala 2.11 reached end-of-life in 2016. Reported at **high** severity.
- A Scala 3.0, 3.1, or 3.2 version pinned the same way. Non-LTS Scala 3 minors receive patches only until the next minor ships, so those lines are frozen. Reported at **high** severity.
- An sbt 0.13.x version pinned in `project/build.properties`. The [sbt download page](https://www.scala-sbt.org/download/) lists 0.13.x as end of life on 2018-11-30. Reported at **high** severity.

Each finding carries its rule's source, replacement, migration steps, and verification commands.

## How versions are matched

- An exact version (a `.scala-version` pin, an exact `scalaVersion` value, or an `sbt.version` pin) uses the first rule whose `vers` range contains it. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A constraint that is not an exact `major.minor.patch` pin is matched only against a rule that covers every version of that package. It is never reported as an old Scala runtime, because the project may build with a newer one.
- Scala is matched as `pkg:generic/scala`, and sbt as `pkg:generic/sbt`.

## What it intentionally does not judge

- Partial Scala versions such as `2.11` or `3.3` without a patch component.
- `system`, `latest`, empty values, interpolations (`s"…"` / `${…}`), and multi-line string forms.
- Other `*.sbt` files, `project/*.scala` build definitions, and `plugins.sbt`.
- A `build.properties` file outside a `project/` directory.
- Scala 2.12 and 2.13 (still maintained), current Scala 3 LTS and Next lines, and sbt 1.x / 2.x.
- Vulnerability advisories, license policy, and whether a newer version of a package exists.
- Malformed or oversized files (over 1 MiB, or a line over 4,096 characters) produce nothing, not partial results.

## Known limits and false-positive boundaries

- `build.sbt` is read line by line, not as a Scala AST. A `scalaVersion` that spans lines, uses a non-string literal, or is computed is not matched.
- Cross-building (`crossScalaVersions`) is not read.
- Monorepos are scanned file by file; findings in nested projects are reported like any other.
