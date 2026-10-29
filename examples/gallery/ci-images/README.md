# CI images example

Azure Pipelines images that retired (Ubuntu 20.04, Windows 2019). This directory holds the smallest files that make the ci-images detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/ci-images
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/ci-images --format json
```

The scan is offline and reads the files only.
