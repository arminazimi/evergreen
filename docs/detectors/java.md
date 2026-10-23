# Java and Kotlin (JVM)

The `java` detector reports JDK feature releases that are out of support, as pinned or targeted in a project, and Maven dependencies whose own POM says they moved. It is **beta**: its level is recorded as `beta` in `benchmarks/thresholds.json`, and the precision floor is enforced on the [public corpus](../VALIDATION.md#java-and-kotlin-corpus) (seventeen repositories, twelve chosen blind). The reasoning is in [Decision 0009](../decisions/0009-java-detector.md).

## What it reads

| File | Declaration |
| --- | --- |
| `pom.xml` | the `maven.compiler.release`, `maven.compiler.source`, `maven.compiler.target`, and `java.version` properties; `release`, `source`, and `target` in a `maven-compiler-plugin` configuration; direct `<dependency>` entries with a literal version |
| `build.gradle`, `build.gradle.kts` | toolchain `languageVersion` (`JavaLanguageVersion.of(N)`, `jvmToolchain(N)`); `sourceCompatibility` and `targetCompatibility`; string-notation dependencies such as `implementation("g:a:v")` |
| `.java-version`, `.sdkmanrc`, `.tool-versions` | the pinned JDK (`java=` in `.sdkmanrc`, the `java` entry in `.tool-versions`) |

It walks the repository up to eight directories deep (at most 2,000 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.gradle`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. Files over 1 MiB are skipped. Gradle scripts are never evaluated and `mvn`, `gradle`, and the wrappers are never run.

## What it reports

- A JDK whose **feature release is a non-LTS release that is no longer supported**: Java 9 and 10, 12 to 16, 18 to 20, 22 to 24, and 26. The [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html) says a previous non-LTS release is superseded once a new feature release is available, and the [Eclipse Temurin support page](https://adoptium.net/support/) marks these releases EOSL where it lists them. The sources give a month, not a day, so these rules have no deadline.
- A **toolchain** or **pinned JDK** names the JDK itself and keeps the rule's severity. A **compile level** (`maven.compiler.release`, `sourceCompatibility`) names only the language level the code is compiled for, so it is reported at **medium** severity.
- A **direct dependency whose POM declares a relocation** to new coordinates, at the versions that carry the relocation. Today: `mysql:mysql-connector-java` from 8.0.31 (to `com.mysql:mysql-connector-j`) and `org.slf4j:slf4j-log4j12` from 2.0.13 (to `org.slf4j:slf4j-reload4j`). The finding lists the Java and Kotlin files that import the dependency's packages.

Each finding carries its rule's sources, replacement, migration steps, and suggested verification commands (`./mvnw -B verify || ./gradlew build`).

## What it intentionally does not judge

These produce no finding and are not guessed:

- **LTS releases**: Java 8, 11, 17, 21, and 25 are in Oracle Extended Support or available from Temurin for years, so they are never reported. The same holds for releases before 9, because none of the listed sources states their end of support.
- **Dynamic JDK values** are listed as [unclassified references](../DETECTORS.md#unclassified-references) with file and line: a Maven `${property}`, a version catalog entry, `JavaVersion.toVersion(x)`, a project or `ext` property, a convention plugin, and `latest` or `system`.
- **The vendor**: `temurin-22`, `22-tem`, and `22` are the same release. Only facts that hold across distributions are used.
- **Gradle, Kotlin, and Maven plugin versions** are read as evidence (the wrapper's `distributionUrl`, the Kotlin plugin version) but no rule uses them: no listed source states when they stop being supported, and the Gradle compatibility matrix is about compatibility.
- Version catalogs (`gradle/libs.versions.toml`), `buildSrc`, `settings.gradle`, Maven profiles, parent POMs, `<dependencyManagement>`, dependency versions given as properties, and transitive dependencies.
- A file with a syntax error: an unclosed XML tag, a `DOCTYPE` or entity in a POM, or an unterminated comment or string in a Gradle script yields nothing, including the declarations before the error.

## Known limits and false-positive boundaries

- A project that keeps an old JDK **on purpose**, for example to test compatibility, is still reported. The rule states a vendor fact; whether the old version is intended is for the repository to decide, for example with a [baseline](../../README.md).
- A compile level below the runtime JDK is common and fine; it is reported at medium severity because the declaration cannot say which JDK runs the code.
- Imports are mapped to files for moved dependencies; calls through imported names are not.
- Relocation rules are checked against the newest ten versions of each watched artifact, so the earliest version that carries a relocation may be earlier than the rule says. The watched list is `tools/importers/maven-candidates.ts`.

## Data

The rules are in `registry/java.json` and ship in the [data bundle](../DATA.md). The `java-1` and `java-2` [importers](../IMPORTERS.md) draft them from the Oracle roadmap, the Temurin support page, and Maven Central.

## Validation

Seventeen public repositories at pinned commits cover this detector: five targeted and twelve chosen blind by the rule in [Validation](../VALIDATION.md#java-and-kotlin-blind-selection). Every expected finding has a `maintainer-review` note naming the path and line. Recall was checked by hand over the blind repositories by searching every `pom.xml`, Gradle script, and version pin for JDK declarations and comparing the hits with the report. The one declaration not reported is a `java.version` inside a Maven `<profile>` (`eh3rrera/graphql-java-spring-boot-example`), which the detector intentionally does not judge (see above), so that repository is a zero-finding entry.
