# Go detector fixtures

These fixtures define the parser boundary for Go version declarations. Parsers
should return exact one-based line numbers, ignore unsupported or dynamic forms,
and never throw for malformed input.

| Fixture | Expected case |
| --- | --- |
| `positive/go.mod` | Static `go`, `toolchain`, and direct `require` declarations. The dependency marked `// indirect` is not a direct requirement. |
| `positive/go.work` | Static `go` and `toolchain` declarations in a workspace file. |
| `negative/go.mod` | Commented lookalikes, unrelated keys, dynamic values, and indirect requirements produce no declarations. |
| `negative/go.work` | Commented lookalikes, unrelated paths, and dynamic values produce no declarations. |
| `zero/go.mod` | A valid module file with no supported version declarations produces no declarations. |
| `zero/go.work` | A valid workspace file with only local `use` directives produces no declarations. |
| `malformed/go.mod` | An unterminated `require` block is handled without throwing or returning partial declarations. |
| `malformed/go.work` | An unterminated `use` block is handled without throwing or returning partial declarations. |

