/**
 * Maven coordinates (`groupId:artifactId`) the `java-2` importer checks for a relocation.
 *
 * Maven Central has no list of relocated artifacts: a maintainer declares a relocation in the POM of
 * the artifact itself. The importer reads each candidate's newest POMs, so add a coordinate here when a
 * dependency is known to have moved. A candidate whose newest POM has no relocation produces no rule and
 * is named in the importer's notes, so it can be removed. Keep the list sorted.
 */
export const MAVEN_CANDIDATES: readonly string[] = [
  "mysql:mysql-connector-java",
  "org.hibernate:hibernate-entitymanager",
  "org.slf4j:slf4j-log4j12",
  "xml-apis:xml-apis",
];
