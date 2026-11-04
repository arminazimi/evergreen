# Rust example

A Rust 1.98 toolchain and unmaintained crates. This directory holds the smallest files that make the rust detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/rust scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/rust scan --format json
```

The scan is offline and reads the files only.
