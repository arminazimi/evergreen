# 0022 — Match Python `TestCase` method calls with a `method` shape

Status: accepted

## Problem

Python rules match a symbol by how it is used. The `call`, `construct`, and `reference` shapes resolve the name through the file's imports, so `from unittest import TestCase` followed by `self.assertEquals(a, b)` can only be found if the matcher knows which binding `self` refers to. It does not. `self.assertEquals` has no import binding: `self` is a parameter, and the method belongs to the class the test inherits from. The `call` and `reference` matchers therefore cannot find deprecated `TestCase` aliases such as `assertEquals`, which the Python 3.12 rename codemod needs to report and rewrite.

## Decision

Add a `method` value to the symbol `shape` enum. A `method` matcher matches a call by name on any receiver, when the call is inside a class that directly subclasses `unittest.TestCase` or an imported alias of `TestCase`.

1. **What it matches.** A call whose attribute name equals the matcher's `symbol` (for example `assertEquals`), on any receiver (`self`, `cls`, another object, or no import at all). The usage is reported at the method name, and the reported symbol is the matcher's `module.symbol` when a `module` is given.
2. **Which class counts.** The closest enclosing class definition of the call must list `unittest.TestCase`, `TestCase`, or an alias bound by `from unittest import TestCase as T` (or `import unittest as u` followed by `u.TestCase`) among its direct bases. A call inside a nested function or helper class counts only if that closest class qualifies. A class that inherits from a subclass of `TestCase` but not from `TestCase` directly does not count, because the check does not follow base-class chains.
3. **Python only, in both places.** The published registry schema allows `method` only when `language` is `python`, through an `if`/`then`/`else` clause that rejects `method` for every other language. The runtime validator `isUsageMatcher` in `src/sdk.ts` enforces the same rule, so a non-Python `method` matcher fails validation in the registry loader and is not accepted as a detector usage matcher.
4. **Other shapes unchanged.** `call`, `construct`, `reference`, and `option` keep their meaning and their resolution rules.

## Why

- **The binding is the wrong anchor for `TestCase` methods.** The method is reached through the class, not through an import, so the import-based shapes cannot see it. Looking at the enclosing class is the only signal the file gives that `self.assertEquals` refers to a `TestCase` method.
- **A direct-base check is narrow on purpose.** Following base chains needs cross-file resolution, which the scanner does not do offline. A direct check misses some inherited tests, which is a false negative; it does not report calls that are not `TestCase` methods, which would be a false positive. For a lifecycle finding, a false positive is the costlier error.
- **Python only.** `unittest` is a Python module, and `construct` already has the same Python-only restriction in the validator, so the new shape follows that pattern.

## Consequences

- The published registry schema gains one enum value. The change is additive: a schema consumer that rejects unknown shapes will reject a `method` matcher, and an existing rule that uses none of the five values is unaffected.
- The detector SDK gains the same value. Detectors built against the earlier SDK never write `method`, so they keep working. A detector that uses `method` for a non-Python language is rejected, as described above.
- Existing rules and registry data are unaffected. The only rules that use `method` are the new Python rules in this change, such as `python.symbol.unittest.removed-aliases`. No existing rule changes, and no existing match result changes, because the new code path runs only for matchers with this shape.
- The rules documentation in `docs/RULES.md` describes the shape in its `shape` field table.
