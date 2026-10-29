# Example gallery

One minimal repository per detector. Each directory is the smallest project that makes its detector report, with `expected.json` holding the exact findings a scan must return.

Every example is scanned by `tests/examples-gallery.test.ts`, so a rule or detector change that alters an example fails CI until the example and its expected output are reviewed together.

- Scans read the files and bundled lifecycle data only: no network, and nothing in an example is executed.
- `expected.json` is compared as a whole: rule id, file path, and severity, sorted.
- Examples are deliberately outdated. Do not copy them into a real project.

The [90-second demo](../../docs/DEMO.md#example-gallery) explains how to scan one and lists what each example shows.
