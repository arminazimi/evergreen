# Scala example

Scala 2.11 and sbt 0.13. This directory holds the smallest files that make the scala detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/scala
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/scala --format json
```

The scan is offline and reads the files only.
