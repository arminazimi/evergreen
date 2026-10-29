# Swift example

An Xcode version below 15. This directory holds the smallest files that make the swift detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/swift
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/swift --format json
```

The scan is offline and reads the files only.
