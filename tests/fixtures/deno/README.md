# Deno fixtures

Each directory here is a small repository that the deno detector scans in `tests/deno-detector.test.ts`.

| Directory | Contains | Expected |
| --- | --- | --- |
| `zero/` | Supported Deno and Bun version pins | no findings |
| `malformed/` | Broken or truncated deno declarations | no findings, and no crash |
| `deno-1/` | Deno 1.x pin in deno.json | deno.runtime.eol-1.x |
| `bun-1/` | Bun 1.0.x pin in .bun-version and Bun 0.x pin in bunfig.toml | deno.bun.runtime.eol-1.0 and deno.bun.runtime.eol-0.x |
| `negative/` | Range constraints, variables, and 'latest' | no findings |
