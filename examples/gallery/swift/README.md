# Swift example

An Xcode version below 15. This directory holds the smallest files that make the swift detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/swift scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/swift scan --format json
```

The scan is offline and reads the files only.
