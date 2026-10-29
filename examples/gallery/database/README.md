# Database example

PostgreSQL 11 and 12 declared in Compose and Terraform. This directory holds the smallest files that make the database detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/database
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/database --format json
```

The scan is offline and reads the files only.
