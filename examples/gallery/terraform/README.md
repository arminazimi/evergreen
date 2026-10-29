# Terraform example

Terraform CLI 1.14, which is past end of support. This directory holds the smallest files that make the terraform detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/terraform
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/terraform --format json
```

The scan is offline and reads the files only.
