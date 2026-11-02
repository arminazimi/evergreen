# Codemods

`evergreen fix` plans deterministic repairs for findings whose change is mechanical, and prints them as unified diffs that `git apply` accepts. It never writes a file or runs a command. A codemod applies only while the text it rewrites still matches the finding, and every finding it declines is reported as a refusal with the reason.

```bash
evergreen fix --dry-run            # print the patches
evergreen fix --branch <name>      # apply them on a local branch and re-scan
```

## Dockerfile legacy syntax

Rules `container.dockerfile.maintainer` and `container.dockerfile.legacy-env-format` are repaired by the `dockerfile-legacy` fixer.

| Before | After |
| --- | --- |
| `MAINTAINER Evergreen Team <team@example.com>` | `LABEL org.opencontainers.image.authors="Evergreen Team <team@example.com>"` |
| `ENV APP_HOME /opt/app` | `ENV APP_HOME="/opt/app"` |

The fixer leaves an instruction alone and reports why when the value contains a double quote or a backslash, when the instruction continues on another line, when the value contains a heredoc, and when the instruction sits inside an `ONBUILD` trigger. An `ENV key=value` assignment is already in the supported form and is not reported.

A worked example lives in [`examples/codemods/dockerfile-legacy`](../examples/codemods/dockerfile-legacy).
`evergreen fix` repairs some deprecations exactly, at the lines a scan reports, and prints unified diffs that `git apply` accepts. Nothing is written unless you pass `--branch`, and no codemod uses the network or runs the scanned repository's code. A codemod rewrites a finding only when the replacement behaves identically for every input the matched shape accepts; anything else is left unchanged and listed as a refusal in `fix --json`.
## node-renames
Rewrites the Node.js deprecations that are pure renames: the old name calls the same implementation. Only the member name changes; the receiver expression and the arguments are kept byte-for-byte.
| Rule | Before | After |
|---|---|---|
| `nodejs.symbol.os.tmpdir` | `os.tmpDir()` | `os.tmpdir()` |
| `nodejs.symbol.path.makelong` | `path._makeLong(p)` | `path.toNamespacedPath(p)` |
| `nodejs.symbol.async-hooks.currentid` | `async_hooks.currentId()` | `async_hooks.executionAsyncId()` |
| `nodejs.symbol.async-hooks.triggerid` | `async_hooks.triggerId()` | `async_hooks.triggerAsyncId()` |
| `nodejs.symbol.crypto.hash` | `crypto.Hash(algorithm)` called without `new` | `crypto.createHash(algorithm)` |
| `nodejs.symbol.crypto.hmac` | `crypto.Hmac(algorithm, key)` called without `new` | `crypto.createHmac(algorithm, key)` |
Each equivalence is read from the Node.js source: [`tmpDir` is `deprecate(tmpdir, …)`](https://github.com/nodejs/node/blob/v13.14.0/lib/os.js#L298), [`_makeLong` is assigned `toNamespacedPath` on both platforms](https://github.com/nodejs/node/blob/v22.23.0/lib/path.js#L1725-L1726), [`currentId` and `triggerId` are renamed to the same functions](https://github.com/nodejs/node/blob/v8.1.4/lib/async_hooks.js#L183-L193), and [`Hash`/`Hmac` called without `new` construct the same object `createHash`/`createHmac` return](https://github.com/nodejs/node/blob/v22.23.0/lib/internal/crypto/hash.js#L88-L163).
Two candidates are not covered because they are not exact aliases. `os.getNetworkInterfaces()` returns the native flat array while `os.networkInterfaces()` builds the keyed object, and `module.createRequire()` validates its argument and decodes non-absolute strings as file URLs while `module.createRequireFromPath()` accepts any path.
Refused, with the reason in `fix --json`:
- a call through a local binding, such as a destructured or aliased import (`const { tmpDir } = require("os"); tmpDir()`);
- an optional call (`os.tmpDir?.()` or `os?.tmpDir()`);
- a computed member access (`os["tmpDir"]()`);
- a constructor call such as `new crypto.Hash(...)`, which is not the call form the rename covers;
`evergreen fix` prints deterministic patches for findings whose repair is purely syntactic. It never writes a file, never runs a command, and never uses the network; the output is a unified diff that `git apply` accepts.
evergreen scan .
evergreen fix . | git apply --check
evergreen fix . | git apply
A fixer rewrites only the exact form its rule names. A finding it cannot repair without guessing is left in place and reported as a refusal with the reason, so a patch never hides a change the tool did not understand.
## Terraform legacy syntax
Two Terraform language forms have a one-to-one rewrite:
| Finding | Rewrite |
| `terraform.syntax.interpolation-only` | `"${var.name}"` becomes `var.name` |
| `terraform.function.list-map` | `list(a, b)` becomes `tolist([a, b])`; `map(k, v)` becomes `tomap({ k = v })` |
Interpolation-only strings were deprecated in Terraform v0.12.14. Terraform still accepts them, but recommends the bare expression. The `list()` and `map()` functions were removed in Terraform v0.15, so a configuration that still calls them fails to validate on 0.15 and later.
evergreen scan . --only terraform
evergreen fix . | git apply
terraform init -backend=false && terraform validate
terraform plan
### What is detected
- A quoted string whose entire value is one `${ ... }` interpolation, in a value, object key, or block label.
- A value call to `list()` or `map()`, including one inside an interpolation expression.
A string with any literal text around the interpolation, such as `"prefix-${var.name}"`, is not interpolation-only and is not reported. Neither are heredocs, comments, plain string contents, `%{ ... }` directives, escaped strings, or the `list(string)` and `map(object({...}))` type constraints, which remain valid.
### What is rewritten
- An interpolation-only string in a value position loses its quotes. A string used as an object key or a block label is refused: removing its quotes would change the key syntax or produce invalid HCL.
- A `list()` or `map()` call is rewritten only when every argument is on one line and the argument count is valid. `list()` needs at least one argument, `map()` needs an even number of key/value arguments, and each key must be an identifier or a quoted string.
- A call whose arguments span lines, an empty `list()`, an odd `map()` argument count, or an expression map key is refused with the reason rather than guessed.
- Files under `.terraform/`, files whose header says another tool generates them, and files without a trailing newline are refused. Finding a file already in its rewritten form leaves nothing for a second pass.
The `examples/codemods/terraform-legacy` directory contains a before and after pair. The detector and codemod use bounded, pure parsing only; Terraform is never run.
## python-imp
Rewrites the `imp` calls that have exact `importlib`, `types`, or `sys` equivalents, so the code runs on Python 3.12, where `imp` was [removed](https://docs.python.org/3/whatsnew/3.12.html#removed).
| Rule | Before | After | Import added |
|---|---|---|---|
| `python.symbol.imp.reload` | `imp.reload(m)` | `importlib.reload(m)` | `import importlib` |
| `python.symbol.imp.new-module` | `imp.new_module(n)` | `types.ModuleType(n)` | `import types` |
| `python.symbol.imp.get-magic` | `imp.get_magic()` | `importlib.util.MAGIC_NUMBER` | `import importlib.util` |
| `python.symbol.imp.get-tag` | `imp.get_tag()` | `sys.implementation.cache_tag` | `import sys` |
| `python.symbol.imp.cache-from-source` | `imp.cache_from_source(p)` | `importlib.util.cache_from_source(p)` | `import importlib.util` |
| `python.symbol.imp.source-from-cache` | `imp.source_from_cache(p)` | `importlib.util.source_from_cache(p)` | `import importlib.util` |
Each equivalence is documented by the standard library: [`importlib.reload`](https://docs.python.org/3/library/importlib.html#importlib.reload), [`types.ModuleType`](https://docs.python.org/3/library/types.html#types.ModuleType), [`importlib.util.MAGIC_NUMBER`](https://docs.python.org/3/library/importlib.html#importlib.util.MAGIC_NUMBER), [`sys.implementation.cache_tag`](https://docs.python.org/3/library/sys.html#sys.implementation), [`importlib.util.cache_from_source`](https://docs.python.org/3/library/importlib.html#importlib.util.cache_from_source), and [`importlib.util.source_from_cache`](https://docs.python.org/3/library/importlib.html#importlib.util.source_from_cache).
Each needed import is added on the line after `import imp` when it is not already present. When every `imp.` use in the file was rewritten, the `import imp` line is replaced by the added imports, because `import imp` itself fails on Python 3.12. When any use remains, `import imp` stays and the new imports are inserted after it.
```python
import imp
module = imp.reload(existing)
magic = imp.get_magic()
becomes
```python
import importlib
import importlib.util
module = importlib.reload(existing)
magic = importlib.util.MAGIC_NUMBER
- `imp.find_module`, `imp.load_module`, `imp.load_source`, and `imp.get_suffixes`, which have no exact equivalent;
- a keyword argument the replacement does not accept, such as `imp.reload(m, file=...)`;
- a second positional argument to `imp.cache_from_source`, where it means `debug_override` in `imp` but `optimization` in `importlib.util`;
- any argument to `imp.get_magic` or `imp.get_tag`, whose replacement is a constant;
- a splat argument, whose names are not visible in the source text;
- a call written through a rebinding, such as `reload = imp.reload; reload(m)`;
- `from imp import ...`, `import imp as ...`, an `import imp` statement that also imports other modules, more than one `import imp`, or one that shares its line with other code;
- a file that cannot be read, has syntax errors, or does not end with a newline.
## node-buffer
Rewrites the deprecated Node.js `Buffer` constructor (`nodejs.symbol.buffer.constructor`, DEP0005) and `SlowBuffer` (`nodejs.symbol.slowbuffer`, DEP0030) when the argument's kind is visible in the source text.
|---|---|
| `new Buffer(<number literal>)` / `Buffer(<number literal>)` | `Buffer.alloc(<number>)` |
| `new Buffer(<string or template literal>[, <string literal encoding>])` | `Buffer.from(<string>[, <encoding>])` |
| `new Buffer(<array literal>)` | `Buffer.from(<array>)` |
| `new SlowBuffer(<number literal>)` | `Buffer.allocUnsafeSlow(<number>)` |
`Buffer.alloc` zero-fills the new buffer. The `Buffer` constructor has zero-filled its numeric form since Node.js 8, so the rewrite keeps the old behavior; Node.js documents the deprecation as [DEP0005](https://nodejs.org/api/deprecations.html#dep0005-buffer-constructor-deprecation).
- an identifier, call, member expression, binary expression, spread, or any other argument whose kind is not a number, string, template without substitutions, or array literal;
- `new Buffer(buffer, offset, length)` and any argument count the table does not list;
- an argument wrapped in a TypeScript type assertion (`as`, `satisfies`, `<T>x`, `!`);
- a template literal with substitutions;
- a `SlowBuffer` call without `new`, or a member-expression form such as `buffer.SlowBuffer(...)`;
- a file that cannot be read, does not end with a newline, or does not parse.
## node-util-is
Rewrites the removed Node.js `util.is*` type checks (DEP0044 to DEP0058) to the native expressions Node.js names for them. Only a call with exactly one argument is rewritten; the argument text is kept byte-for-byte.

| Rule | Before | After |
|---|---|---|
| `nodejs.symbol.util.isarray` | `util.isArray(x)` | `Array.isArray(x)` |
| `nodejs.symbol.util.isboolean` | `util.isBoolean(x)` | `typeof x === "boolean"` |
| `nodejs.symbol.util.isbuffer` | `util.isBuffer(x)` | `Buffer.isBuffer(x)` |
| `nodejs.symbol.util.isdate` | `util.isDate(x)` | `util.types.isDate(x)` |
| `nodejs.symbol.util.isregexp` | `util.isRegExp(x)` | `util.types.isRegExp(x)` |
| `nodejs.symbol.util.isfunction` | `util.isFunction(x)` | `typeof x === "function"` |
| `nodejs.symbol.util.isnull` | `util.isNull(x)` | `x === null` |
| `nodejs.symbol.util.isundefined` | `util.isUndefined(x)` | `x === undefined` |
| `nodejs.symbol.util.isnullorundefined` | `util.isNullOrUndefined(x)` | `x == null` |
| `nodejs.symbol.util.isnumber` | `util.isNumber(x)` | `typeof x === "number"` |
| `nodejs.symbol.util.isstring` | `util.isString(x)` | `typeof x === "string"` |
| `nodejs.symbol.util.issymbol` | `util.isSymbol(x)` | `typeof x === "symbol"` |
| `nodejs.symbol.util.isobject` | `util.isObject(x)` | `x !== null && typeof x === "object"` |
| `nodejs.symbol.util.isprimitive` | `util.isPrimitive(x)` | `x === null \|\| (typeof x !== "object" && typeof x !== "function")` |

Each replacement is the function body Node.js already runs: [`util.js`](https://github.com/nodejs/node/blob/v22.23.0/lib/util.js#L120-L212) implements the checks with those expressions, and the [export table](https://github.com/nodejs/node/blob/v22.23.0/lib/util.js#L634-L689) deprecates each name with the same recommendation. `x == null` is the short form of `x === null || x === undefined` and matches nothing else, because loose equality against `null` never coerces an object. `isDate` and `isRegExp` call `util.types` because the deprecated functions were those checks and `instanceof` fails for values from another realm, which `util.isDate` and `util.isRegExp` accepted.

The call may read `util` through `const util = require("util")`, `require("node:util")`, `import util from "util"`, `import * as util from "node:util"`, or a destructured `const { isArray } = require("util")` / `import { isArray } from "util"`. A destructured call is rewritten in place and its import binding is left alone. When `isDate` or `isRegExp` is called through a destructured binding and no namespace binding exists, the call is refused rather than adding an import.

A replacement that is a binary or logical expression is wrapped in parentheses unless its parent is an expression statement, an `if` or `while` condition, a call argument, a return value, or an initializer, so `!util.isNull(a)` becomes `!(a === null)`.

Refused, with the reason in `fix --json`:
- `util.isError(x)`, which needs `Object.prototype.toString(e) === "[object Error]" || e instanceof Error` and has no exact native equivalent on every supported Node version;
- `util.isObject(x)` or `util.isPrimitive(x)` when `x` is not an identifier or a member chain without calls, because the replacement reads `x` twice;
- a call with no argument, more than one argument, or a spread argument;
- an optional call (`util.isArray?.(x)` or `util?.isArray(x)`);
- a call through a binding the file reassigns, such as `let check = util.isArray; check = other; check(x)`;
- a call that contains another `util.is*` call, whose replacement would overlap;
- a file that cannot be read, does not end with a newline, or does not parse.

The `examples/codemods/node-util-is` directory contains an input file to run `evergreen fix` against.

## python-utcnow

Rewrites the two `datetime` methods [deprecated in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html#deprecated) — `datetime.utcnow()` (`python.symbol.datetime.utcnow`) and `datetime.utcfromtimestamp(t)` (`python.symbol.datetime.utcfromtimestamp`) — into forms that return the exact same naive value without the deprecated call.

| Import shape | `utcnow()` becomes | `utcfromtimestamp(t)` becomes |
|---|---|---|
| `from datetime import datetime` | `datetime.now(timezone.utc).replace(tzinfo=None)` | `datetime.fromtimestamp(t, timezone.utc).replace(tzinfo=None)` |
| `import datetime` | `datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)` | `datetime.datetime.fromtimestamp(t, datetime.timezone.utc).replace(tzinfo=None)` |
| `import datetime as dt` | `dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)` | `dt.datetime.fromtimestamp(t, dt.timezone.utc).replace(tzinfo=None)` |

The naive result is preserved on purpose. The [deprecation note](https://docs.python.org/3/whatsnew/3.12.html#deprecated) and the [`datetime` documentation](https://docs.python.org/3/library/datetime.html#datetime.datetime.utcnow) point to `datetime.now(datetime.UTC)`, whose result is timezone-aware; switching a naive datetime to an aware one changes every comparison, serialization, and arithmetic it takes part in. `.replace(tzinfo=None)` strips the awareness the rewrite itself adds, so the value is byte-for-byte what the deprecated call returned. `timezone.utc` is used instead of `datetime.UTC` because it exists on every supported Python 3, while `datetime.UTC` needs 3.11 or newer.

For the `from datetime import datetime` shape, `timezone` is added to that same import statement when it is not already imported. The rewrite follows the file's import shape per call, so a file that imports the class by name and the module under an alias gets each call rewritten in its own shape.

Refused, with the reason in `fix --json`:

- `from datetime import *`, where the codemod cannot tell where the names come from;
- a call through an alias, such as `from datetime import datetime as d` or a rebinding `utcnow = datetime.utcnow`;
- a file that binds `datetime` both as the module and as the class imported by name, where a call written `datetime.` could read either binding;
- a `timezone` name already bound to something other than `datetime.timezone`, which the rewrite would shadow or read wrongly;
- a `from datetime import datetime` statement that is parenthesized or spans several lines, when `timezone` would have to be added to it;
- a `utcnow` call with arguments, and a `utcfromtimestamp` call with none, with a keyword argument, or with a splat;
- a file that cannot be read, has syntax errors, or does not end with a newline.

The `examples/codemods/python-utcnow` directory contains an input file to run `evergreen fix` against.

## python-renames

Rewrites the Python 3.12 removals that are one-to-one renames: two symbols with a current replacement, and the deprecated `unittest.TestCase` aliases that call a current assertion. Only the removed name changes; the receiver, arguments, and every other byte are kept.

| Rule | Before | After |
|---|---|---|
| `python.symbol.configparser.safeconfigparser` | `configparser.SafeConfigParser()` | `configparser.ConfigParser()` |
| `python.symbol.io.openwrapper` | `io.OpenWrapper(path)` | `io.open(path)` |
| `python.symbol.unittest.removed-aliases` | `self.assertEquals(a, b)` | `self.assertEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.assertNotEquals(a, b)` | `self.assertNotEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.assert_(flag)` | `self.assertTrue(flag)` |
| `python.symbol.unittest.removed-aliases` | `self.failUnless(flag)` | `self.assertTrue(flag)` |
| `python.symbol.unittest.removed-aliases` | `self.failIf(flag)` | `self.assertFalse(flag)` |
| `python.symbol.unittest.removed-aliases` | `self.failUnlessEqual(a, b)` | `self.assertEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.failIfEqual(a, b)` | `self.assertNotEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.assertAlmostEquals(a, b)` | `self.assertAlmostEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.assertNotAlmostEquals(a, b)` | `self.assertNotAlmostEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.failUnlessAlmostEqual(a, b)` | `self.assertAlmostEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.failIfAlmostEqual(a, b)` | `self.assertNotAlmostEqual(a, b)` |
| `python.symbol.unittest.removed-aliases` | `self.failUnlessRaises(E, f)` | `self.assertRaises(E, f)` |
| `python.symbol.unittest.removed-aliases` | `self.assertRegexpMatches(s, p)` | `self.assertRegex(s, p)` |
| `python.symbol.unittest.removed-aliases` | `self.assertNotRegexpMatches(s, p)` | `self.assertNotRegex(s, p)` |
| `python.symbol.unittest.removed-aliases` | `self.assertRaisesRegexp(E, p, f)` | `self.assertRaisesRegex(E, p, f)` |

The replacement table is the one in [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html#removed). `SafeConfigParser` has been an alias of `ConfigParser` since Python 3.2, and `io.OpenWrapper` has been an alias of the built-in `open`. The unittest aliases each called the current assertion directly, so the test result is unchanged.

A `from configparser import SafeConfigParser` or `from io import OpenWrapper` name is renamed in the import statement and at each use, so the binding still exists. A module read through `import configparser as cp` is qualified, so only the member name changes. The unittest aliases use the `method` usage shape: a call on any receiver inside a class that subclasses `unittest.TestCase` or `TestCase` (including an imported alias of it). The receiver is not checked, so `helper.assertEquals(...)` inside a test class is renamed too.

Refused, with the reason in `fix --json`:

- `assertDictContainsSubset(...)`, which Python 3.12 removed without a replacement; rewrite the assertion by hand;
- an alias call that is not inside a `unittest.TestCase` subclass;
- a removed name used through an aliased import, such as `from configparser import SafeConfigParser as Renamed`, where renaming the call alone would leave the binding pointing at the removed name;
- a file that cannot be read, has syntax errors, or does not end with a newline.

The `examples/codemods/python-renames` directory contains an input file to run `evergreen fix` against.
