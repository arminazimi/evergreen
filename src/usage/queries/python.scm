; Usage queries for the Python grammar.
; Captures are interpreted by src/usage/python.ts:
;   @module            the dotted module name of an import or from-import
;   @binding.dotted    `import a.b.c` binds `a`; the capture is the whole dotted name
;   @binding.name      imported name of one `from m import name`, with @binding.alias as its local name when renamed
;   @binding.alias     local name of `import m as alias`, or of an aliased from-import name
;   @alias.local / @alias.value   a variable that aliases an existing binding
;   @callee            the function expression of a call

; ---- Imports -------------------------------------------------------------------------------

; import a.b.c
(import_statement
  name: (dotted_name) @module @binding.dotted)

; import a.b.c as d
(import_statement
  name: (aliased_import
    name: (dotted_name) @module
    alias: (identifier) @binding.alias))

; from m import *
(import_from_statement
  module_name: (dotted_name) @module)

; from m import a
(import_from_statement
  module_name: (dotted_name) @module
  name: (dotted_name) @binding.name)

; from m import a as b
(import_from_statement
  module_name: (dotted_name) @module
  name: (aliased_import
    name: (dotted_name) @binding.name
    alias: (identifier) @binding.alias))

; ---- Aliases of an imported binding --------------------------------------------------------

; get = requests.get;  r = requests
(assignment
  left: (identifier) @alias.local
  right: (_) @alias.value)

; ---- Calls ---------------------------------------------------------------------------------

(call
  function: (_) @callee)
