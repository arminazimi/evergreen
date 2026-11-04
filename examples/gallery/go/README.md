# Go example

Go 1.22 and 1.23 toolchain lines in a module and a workspace. This directory holds the smallest files that make the go detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/go scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/go scan --format json
```

The scan is offline and reads the files only.
