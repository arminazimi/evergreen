# Vendored schemas

These files are copied unchanged from their publishers so tests can validate Evergreen's output without the network. They are test inputs: `package.json` leaves this directory out of the npm package.

| File | Source | SHA-256 |
|---|---|---|
| `sarif-2.1.0.json` | [OASIS SARIF 2.1.0 JSON schema](https://github.com/oasis-tcs/sarif-spec/blob/main/sarif-2.1/schema/sarif-schema-2.1.0.json) (the `errata01` schema, JSON Schema draft-04) | `c3b4bb2d6093897483348925aaa73af03b3e3f4bd4ca38cef26dcb4212a2682e` |

To refresh a file, download it again, update the hash here, and run `npm run check`. The SARIF schema is draft-04 and carries a top-level `id`, which Ajv's draft-07 mode rejects; `tests/sarif.test.ts` removes that one keyword in memory before compiling and leaves the file itself untouched.
