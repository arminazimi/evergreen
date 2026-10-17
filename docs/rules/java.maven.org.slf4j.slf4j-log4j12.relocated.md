---
title: "org.slf4j:slf4j-log4j12 has moved to org.slf4j:slf4j-reload4j"
description: "The POM of org.slf4j:slf4j-log4j12 2.1.0-alpha1 declares a relocation to org.slf4j:slf4j-reload4j."
---

# org.slf4j:slf4j-log4j12 has moved to org.slf4j:slf4j-reload4j

The POM of org.slf4j:slf4j-log4j12 2.1.0-alpha1 declares a relocation to org.slf4j:slf4j-reload4j.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `java` |
| Component | `pkg:maven/org.slf4j/slf4j-log4j12` |
| Affected versions | `vers:maven/>=2.0.13` |
| Date from the source | The source gives no day |
| Replacement | org.slf4j:slf4j-reload4j |
| Evidence last seen | 2026-10-17 |
| Reviewed | 2026-10-17 by arminazimi, drafted by the `java-2` importer |
| Review due | 2027-04-15 (180 days after the last review) |
| Rule ID | `java.maven.org.slf4j.slf4j-log4j12.relocated` |

## Sources

- [org.slf4j:slf4j-log4j12 2.1.0-alpha1 POM on Maven Central](https://repo1.maven.org/maven2/org/slf4j/slf4j-log4j12/2.1.0-alpha1/slf4j-log4j12-2.1.0-alpha1.pom)

## Migration

**Constraints**

- Replace org.slf4j:slf4j-log4j12 with org.slf4j:slf4j-reload4j; the relocation in the artifact's POM names the new coordinates, so keep the version unless you intend to upgrade it.
- Update every module and dependency-management block that names the old coordinates, and remove exclusions that mention them.

**Steps**

1. **Change the dependency coordinates.** Replace the reported `org.slf4j:slf4j-log4j12` dependency with `org.slf4j:slf4j-reload4j`.
2. **Align other declarations.** Update every other pom.xml, Gradle build file, version catalog, and BOM override that names the old coordinates.

**Verification**

- `./mvnw -B dependency:tree || ./gradlew dependencies`: Confirm the old coordinates are gone from the resolved dependency graph.
- `./mvnw -B verify || ./gradlew build`: Build and test the project with the new coordinates.

## Detected by

The [`java`](../detectors/java.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/java.json`](https://github.com/arminazimi/evergreen/blob/main/registry/java.json), rule `java.maven.org.slf4j.slf4j-log4j12.relocated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
