# Bundled trust material

`sigstore-trusted-root.json` is the Sigstore public-good trusted root: the keys and validity periods of the Fulcio certificate authority, the Rekor transparency log, and the certificate transparency log. Evergreen uses it to verify a lifecycle data bundle's signature offline. It ships in the npm package.

| | |
| --- | --- |
| Source | https://github.com/sigstore/root-signing/blob/main/targets/trusted_root.json |
| Fetched | 2026-10-16 |
| SHA-256 | `6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66` |

Trust in this file is trust in the Evergreen release that contains it, the same as trust in the registries bundled with that release. Sigstore rotates these keys occasionally; when a signing key in the file expires, signatures made after that time no longer verify and Evergreen falls back to its bundled data with a warning. Refresh the file when Sigstore publishes a new root, update the hash above, and release. A test checks the hash.
