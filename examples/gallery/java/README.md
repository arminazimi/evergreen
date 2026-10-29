# Java example

Retired JDK lines, Spring Boot 2.x/3.x, and a relocated Maven artifact. This directory holds the smallest files that make the java detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/java
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/java --format json
```

The scan is offline and reads the files only.
