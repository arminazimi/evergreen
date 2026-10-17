# Java and Kotlin (JVM) fixtures

These fixtures define the parser boundary for JDK and build declarations (see
[decision 0009](../../../docs/decisions/0009-java-detector.md)). Parsers return exact
one-based line numbers, ignore dynamic or unsupported forms, and never throw for
malformed input. Each folder is a small repository root.

A parser returns every literal declaration it can read, including a supported JDK;
whether a declaration is a finding is decided later by the registry. A dynamic value
(`${jdk.version}`, a version catalog entry) is returned as a dynamic declaration so
the detector can list it as unclassified, and is never expanded.

| Fixture | Expected case |
| --- | --- |
| `positive/maven/pom.xml` | The four `maven.compiler.*` and `java.version` properties (`22`, `18`, and `1.8` for source and target), a `maven-compiler-plugin` `source` and `target` (`16`), and a direct dependency with a literal version. |
| `positive/gradle-groovy/build.gradle` | A toolchain `languageVersion = JavaLanguageVersion.of(20)`, `sourceCompatibility = JavaVersion.VERSION_19`, a quoted `targetCompatibility = '18'`, the Kotlin plugin version, and a string-notation dependency. |
| `positive/gradle-groovy/gradle/wrapper/gradle-wrapper.properties` | A `distributionUrl` with an escaped colon and a Gradle version in the file name. |
| `positive/gradle-kotlin/build.gradle.kts` | `languageVersion.set(JavaLanguageVersion.of(24))`, `JavaVersion.VERSION_23`, `kotlin("jvm") version "1.9.22"`, and a Kotlin DSL dependency. |
| `positive/pins/.java-version` | A bare feature release (`16`). |
| `positive/pins/.sdkmanrc` | `java=18.0.2-tem`, after a comment line. |
| `positive/pins/.tool-versions` | `java temurin-22.0.1` after an unrelated `nodejs` entry. |
| `negative/maven/pom.xml` | A commented property, text in `<description>`, a property that is a `${...}` reference, `some.java.version`, a `source` and `target` under another plugin, and a supported JDK (`17`). |
| `negative/gradle/build.gradle` | Commented and quoted lookalikes, a toolchain read from a version catalog, `JavaVersion.toVersion(javaVersion)`, a project property, and a supported JDK (`VERSION_17`). |
| `negative/pins/` | A supported JDK (`17`), `.sdkmanrc` for other tools, and `.tool-versions` with a commented `java` line and other tools. |
| `zero/maven/pom.xml`, `zero/gradle/`, `zero/pins/` | Only supported JDKs (21, 25) and a current Gradle: no findings. |
| `malformed/maven/pom.xml` | An unclosed tag. |
| `malformed/maven/entity-pom.xml` | A `DOCTYPE` with an entity declaration; entities are never expanded. |
| `malformed/gradle/build.gradle` | Unclosed calls and a truncated `VERSION_`. |
| `malformed/gradle/gradle/wrapper/gradle-wrapper.properties` | An empty value, a NUL byte, and a distribution file name with no version. |
| `malformed/pins/` | A binary `.java-version`, `.sdkmanrc` lines with no value or no key, and `.tool-versions` lines with no version. |

The malformed files are written with `printf` so the NUL bytes and the missing final
lines stay exactly as shown; do not reformat them.
