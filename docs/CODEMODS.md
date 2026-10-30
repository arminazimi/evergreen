# Codemods

`evergreen fix` repairs some deprecations exactly, at the lines a scan reports, and prints unified diffs that `git apply` accepts. Nothing is written unless you pass `--branch`, and no codemod uses the network or runs the scanned repository's code. A codemod rewrites a finding only when the replacement behaves identically for every input the matched shape accepts; anything else is left unchanged and listed as a refusal in `fix --json`.

## node-buffer

Rewrites the deprecated Node.js `Buffer` constructor (`nodejs.symbol.buffer.constructor`, DEP0005) and `SlowBuffer` (`nodejs.symbol.slowbuffer`, DEP0030) when the argument's kind is visible in the source text.

| Before | After |
|---|---|
| `new Buffer(<number literal>)` / `Buffer(<number literal>)` | `Buffer.alloc(<number>)` |
| `new Buffer(<string or template literal>[, <string literal encoding>])` | `Buffer.from(<string>[, <encoding>])` |
| `new Buffer(<array literal>)` | `Buffer.from(<array>)` |
| `new SlowBuffer(<number literal>)` | `Buffer.allocUnsafeSlow(<number>)` |

`Buffer.alloc` zero-fills the new buffer. The `Buffer` constructor has zero-filled its numeric form since Node.js 8, so the rewrite keeps the old behavior; Node.js documents the deprecation as [DEP0005](https://nodejs.org/api/deprecations.html#dep0005-buffer-constructor-deprecation).

Refused, with the reason in `fix --json`:

- an identifier, call, member expression, binary expression, spread, or any other argument whose kind is not a number, string, template without substitutions, or array literal;
- `new Buffer(buffer, offset, length)` and any argument count the table does not list;
- an argument wrapped in a TypeScript type assertion (`as`, `satisfies`, `<T>x`, `!`);
- a template literal with substitutions;
- a `SlowBuffer` call without `new`, or a member-expression form such as `buffer.SlowBuffer(...)`;
- a file that cannot be read, does not end with a newline, or does not parse.
