# Kubernetes example

Removed API versions in plain manifests, Helm templates, and Kustomize. This directory holds the smallest files that make the kubernetes detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/kubernetes
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/kubernetes --format json
```

The scan is offline and reads the files only.
