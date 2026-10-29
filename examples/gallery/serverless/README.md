# Serverless example

Retired AWS Lambda runtimes in Serverless Framework and SAM templates. This directory holds the smallest files that make the serverless detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/serverless
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/serverless --format json
```

The scan is offline and reads the files only.
