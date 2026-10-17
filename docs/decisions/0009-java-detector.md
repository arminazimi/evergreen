# 0009 — Detect end-of-support JDK releases and relocated Maven dependencies in JVM projects

Status: accepted

Evergreen will add a `java` detector for Java and Kotlin projects. It reads the JDK a project pins or targets, and the Maven coordinates it depends on, and reports the ones a vendor or maintainer has documented as out of support or moved. It follows the existing [detector SDK](../DETECTORS.md) and the [v2 registry](0004-registry-v2.md); it adds no new engine behavior and no new VERS scheme.

## What the detector reads

| Declaration | Files | Deterministic? |
| --- | --- | --- |
| `maven.compiler.release`, `maven.compiler.source`, `maven.compiler.target`, `java.version` | `<properties>` of `pom.xml` | Yes, when the value is a literal |
| `<release>`, `<source>`, `<target>` | `maven-compiler-plugin` `<configuration>` in `pom.xml` | Yes, when the value is a literal |
| `<dependency>` with literal `groupId`, `artifactId`, and `version` | `pom.xml` | Yes |
| `JavaLanguageVersion.of(N)` | `build.gradle`, `build.gradle.kts` (toolchain `languageVersion`) | Yes, when `N` is an integer literal |
| `sourceCompatibility`, `targetCompatibility` | same | Yes, for `JavaVersion.VERSION_N`, `'N'`, `"N"`, and `N` |
| Kotlin plugin version | same: `kotlin("jvm") version "X"`, `id 'org.jetbrains.kotlin.jvm' version 'X'` | Read as evidence; not judged (see below) |
| `implementation("g:a:v")` and the other string-notation configurations | same | Yes, when the notation is a literal |
| `distributionUrl` | `gradle/wrapper/gradle-wrapper.properties` | Read as evidence; not judged |
| the pinned JDK | `.java-version`, `.sdkmanrc` (`java=`), `.tool-versions` (`java`) | Yes, when the version is a literal |

The Gradle files are Groovy or Kotlin **programs**. Evergreen never evaluates them: it reads single lines that match one of the forms above, outside comments and string literals, and nothing else.

## What is dynamic, and what happens to it

A JDK declaration is **dynamic** when its value cannot be known without running something:

- a Maven property reference: `<maven.compiler.release>${jdk.version}</maven.compiler.release>`. Evergreen does not expand it: the property is a repository value, but a parent POM, a profile, or a command-line `-D` can override it;
- a Gradle value that is not an integer or `JavaVersion.VERSION_N` literal: a version catalog (`libs.versions.java.get()`), `JavaVersion.toVersion(x)`, a project or `ext` property, or a convention plugin;
- a pinned version with no feature release: `latest`, `system`, or an empty value.

Dynamic declarations produce **no finding** and no guess. Where the engine reports unclassified references (`ScanResult.unclassified`), a dynamic JDK declaration is reported there with its file and line, so the reader can see it was seen and not judged. A Maven or Gradle dependency with a non-literal version is skipped silently: with no coordinates to name there is nothing to say was left unjudged.

## How a version maps to a JDK feature release

The feature release is the first component of the version: `22`, `22.0.1`, `22-ea`, and `temurin-22.0.1` are release 22. The legacy form `1.N` means release `N` (`1.8` is 8, `1.8.0_292` is 8). A vendor prefix (`temurin-`, `openjdk-`, `zulu-`) is ignored and a SDKMAN suffix (`-tem`, `-zulu`) is ignored: **the vendor is never used to decide support**. A value that does not start with a number is dynamic or malformed, not a release.

A rule's VERS carries the feature release as `N.0.0` on the `semver` scheme (`vers:semver/>=12.0.0|<17.0.0`), so a declaration is matched by its feature release alone.

## Where lifecycle facts come from

Allowed sources, each recorded in the rule's `sources` and `provenance`:

- the [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html), which lists the LTS releases, the Premier and Extended Support dates, and states that once a new feature release is available a previous non-LTS release is superseded;
- the [Eclipse Temurin support page](https://adoptium.net/support/), which marks a code stream **EOSL** (End of Service/Support Life) when no further builds are planned;
- for Maven relocations, the artifact's own POM on Maven Central (`<distributionManagement><relocation>`), which is the maintainer stating the new coordinates;
- the [Gradle compatibility matrix](https://docs.gradle.org/current/userguide/compatibility.html), only to say which Java versions a Gradle version can run on, never to decide that a Gradle version is unsupported.

The first rules cover **non-LTS feature releases only** (9 and 10, 12 to 16, 18 to 20, 22 to 24, and 26): each is superseded by the next feature release and its public updates have ended. The sources give month and year, not a day, so a rule has **no `deadline`** and states the month in its summary; Evergreen does not invent a day.

Rejected inputs, which are never used to produce a rule or a finding:

- **popularity**, or the share of projects on a JDK;
- **"a newer JDK exists"** for an LTS release: Java 8, 11, 17, 21, and 25 are LTS, and Oracle lists Extended Support to 2030 (8), 2032 (11), 2029 (17), 2031 (21), and 2033 (25); Temurin lists 8, 11, 17, 21, and 25 as available to at least 2027 or later. None of them is flagged. Oracle Premier Support ending (8 in 2022, 11 in 2023) is a commercial milestone, not the end of the release line, and is not a finding;
- **endoflife.date** and other aggregators, as a primary source;
- **a vendor's own dates** for a vendor Evergreen cannot identify from the declaration. A pin of `17` does not say whether it runs on Temurin, Corretto, or Oracle JDK, so only facts that hold across distributions are used;
- JDK releases before 9 (`1.6`, `1.7`) and Gradle, Kotlin, and Maven versions: no source in the list above states their end of support, so Evergreen makes no claim.

## What it does not judge

- **Gradle wrapper, Kotlin plugin, and Maven plugin versions.** They are parsed and carried as evidence so a later rule can use them, but the first version raises no finding from them. The Gradle compatibility matrix is a statement about compatibility, not about support.
- **Compile target versus runtime.** `maven.compiler.release=22` and `sourceCompatibility = 22` name the language level the code is compiled for, not the JDK that runs it, so they are reported at **medium** severity. A toolchain `languageVersion` and a pinned JDK name the JDK itself and keep the rule's severity.
- **Version catalogs** (`gradle/libs.versions.toml`), **`buildSrc`**, convention plugins, `settings.gradle`, Maven profiles, parent POMs, and `<dependencyManagement>` versions.
- **Maven properties used as versions** (`<version>${guava.version}</version>`), dependency scopes, and transitive dependencies.
- **Building, resolving, or downloading anything.** `mvn`, `gradle`, and the wrappers are never run, and no repository is queried during a scan.

## Where it looks

The detector walks the repository (eight directories deep, at most 2,000 matching files, never following symbolic links) and skips dependency, build, and test-fixture directories: `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.gradle`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. Files over 1 MiB are skipped.

Parsers treat contents as untrusted: input over a size limit yields nothing, line length and nesting are bounded, a malformed XML or properties file yields **no** declarations (not those read before the error), a `DOCTYPE` or entity declaration in a POM makes it unreadable, and nothing is evaluated.

## Examples for the fixture task

True positives (a rule exists for the feature release and the value is literal):

- `<maven.compiler.release>22</maven.compiler.release>`, `<java.version>18</java.version>`, and a `maven-compiler-plugin` `<source>16</source>`
- `languageVersion = JavaLanguageVersion.of(20)` and `languageVersion.set(JavaLanguageVersion.of(24))`
- `sourceCompatibility = JavaVersion.VERSION_19` and `targetCompatibility = '18'`
- `.java-version` with `16`, `.sdkmanrc` with `java=18.0.2-tem`, `.tool-versions` with `java temurin-22.0.1`

Must not produce findings:

- a commented property, text in `<description>`, `some.java.version`, `source` and `target` under another plugin
- `${jdk.version}`, a version catalog entry, `JavaVersion.toVersion(x)`, a project property (these are listed as unclassified)
- `17`, `21`, and `25` (LTS releases), and `1.8`
- `.sdkmanrc` lines for other tools, `.tool-versions` entries for other tools, a commented `java` line

Malformed: an unclosed XML tag, an entity declaration, unclosed Gradle calls, an empty or binary properties value, and pin files with no version. All must produce no findings and no crash.

## Consequences

- The detector is quiet by default. A build that reads its JDK from a version catalog gets no lifecycle verdict from Evergreen, only an unclassified entry, which is the honest answer.
- No rule says a Gradle or Kotlin version is unsupported. That gap is deliberate until their projects publish a lifecycle statement.
- Relocated-dependency rules come from a candidate list checked against Maven Central by an importer, never from the scan.
- Adding the detector means adding the scaffolded files and two registrations (`src/detectors/index.ts` and `BUNDLED_ECOSYSTEMS` in `src/data-bundle.ts`), as described in [DETECTORS.md](../DETECTORS.md).
