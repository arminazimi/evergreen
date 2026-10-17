---
title: "Java 22 to 24 are no longer supported"
description: "The Oracle Java SE Support Roadmap lists Java 22 to 24 as non-LTS releases whose Premier Support ended between September 2024 and September 2025."
---

# Java 22 to 24 are no longer supported

The Oracle Java SE Support Roadmap lists Java 22 to 24 as non-LTS releases whose Premier Support ended between September 2024 and September 2025. It says a previous non-LTS release is superseded once a new feature release is made available. The Eclipse Temurin support page lists Java 22, 23, and 24 as EOSL, with end of availability in September 2024, March 2025, and September 2025.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `java` |
| Component | `pkg:generic/java` |
| Affected versions | `vers:semver/>=22.0.0\|<25.0.0` |
| Date from the source | The source gives no day |
| Replacement | Java 25 (LTS) or later |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi |
| Review due | 2027-04-15 (180 days after the last review) |
| Rule ID | `java.jdk.end-of-support-22-24` |

## Sources

- [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html)
- [Eclipse Temurin support](https://adoptium.net/support/)

## Migration

**Constraints**

- Keep the JDK in the build files, the version pin files, CI, and container images on one supported release; a long-term-support release avoids repeating this migration every six months.
- Check that the Gradle or Maven version in the project can run on the target JDK (the Gradle compatibility matrix lists the supported Java versions).
- A compile level (`maven.compiler.release`, `sourceCompatibility`) is not the JDK that runs the code: lower it only if the code must still run on an older runtime.

**Steps**

1. **Move the reported declaration to a supported JDK.** Change the reported version to a long-term-support release (see the replacement) in the build file or the version pin file.
2. **Align the other JDK declarations.** Update every other pom.xml, Gradle toolchain, `.java-version`, `.sdkmanrc`, `.tool-versions`, CI JDK setup, and container base image that names the old release, so the repository agrees.

**Verification**

- `./mvnw -B verify || ./gradlew build`: Build and test the project on the new JDK with the wrapper the project uses.
- `java -version`: Confirm the JDK on the path (or the one the toolchain selects) is the intended release.

## Detected by

The [`java`](../detectors/java.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/java.json`](https://github.com/arminazimi/evergreen/blob/main/registry/java.json), rule `java.jdk.end-of-support-22-24`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
