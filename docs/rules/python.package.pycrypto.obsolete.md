---
title: "PyCrypto is obsolete and vulnerable"
description: "The archived project warns that PyCrypto 2.x is unmaintained, obsolete, and contains security vulnerabilities."
---

# PyCrypto is obsolete and vulnerable

The archived project warns that PyCrypto 2.x is unmaintained, obsolete, and contains security vulnerabilities.

| | |
| --- | --- |
| Status | End of life |
| Severity | critical |
| Ecosystem | `python` |
| Component | `pkg:pypi/pycrypto` |
| Affected versions | `vers:pypi/*` |
| Date from the source | 2022-01-27 |
| Replacement | pycryptodome or cryptography |
| Evidence last seen | 2026-10-14 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `python.package.pycrypto.obsolete` |

## Sources

- [Archived PyCrypto repository warning](https://github.com/pycrypto/pycrypto)

## Migration

**Constraints**

- Treat this as a security-sensitive migration: preserve algorithms, modes, key sizes, padding, nonces or IVs, authentication tags, and serialized ciphertext formats.
- Do not silently change cryptographic primitives or defaults without explicit compatibility and security review.

**Steps**

1. **Choose the maintained library.** Select pycryptodome for a closer Crypto namespace migration or cryptography for a higher-level maintained interface.
2. **Migrate cryptographic usages.** Update every reported import and operation, making keys, modes, padding, nonces, tags, and encoding explicit.
3. **Replace the dependency.** Remove pycrypto, add the selected maintained package, and regenerate the environment lock data.
4. **Verify cryptographic test vectors.** Confirm known plaintext/ciphertext vectors and backward compatibility with persisted encrypted data.

**Verification**

- `python -m pytest`: Run cryptographic vectors and repository tests.
- `python -m pip check`: Check installed dependency compatibility.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.pycrypto.obsolete`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet.
