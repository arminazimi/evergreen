# C++ example

A CMake policy version below 3.5, which CMake removed. This directory holds the smallest files that make the cpp detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/cpp
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/cpp --format json
```

The scan is offline and reads the files only.
