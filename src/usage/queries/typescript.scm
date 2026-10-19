; TypeScript-only syntax, appended to javascript.scm for the TypeScript and TSX grammars.
; Uses the same captures as javascript.scm.

; import legacy = require("legacy")
(import_statement
  (import_require_clause
    (identifier) @binding.namespace
    source: (string (string_fragment) @module)))
