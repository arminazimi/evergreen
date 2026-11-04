# Dart example

An exact Dart 3.12 SDK pin, a release line without security updates. This directory holds the smallest files that make the dart detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/dart scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/dart scan --format json
```

The scan is offline and reads the files only.
