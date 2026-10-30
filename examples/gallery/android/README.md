# Android example

`targetSdk 34` (below Google Play's existing-app floor of 35) and Play Billing 5.x, which Google no longer supports. This directory holds the smallest files that make the android detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/android
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/android --format json
```

The scan is offline and reads the files only.
