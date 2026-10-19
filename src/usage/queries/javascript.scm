; Usage queries shared by the JavaScript, TypeScript, and TSX grammars. TypeScript-only syntax lives in typescript.scm.
; Captures are interpreted by src/usage/javascript.ts:
;   @module            the module name inside the quotes of an import, require, re-export, or import()
;   @binding.default   local name bound to a default import
;   @binding.namespace local name bound to a whole module (import * as, require, import = require)
;   @binding.name      imported name of one import specifier, with @binding.alias as its local name when renamed
;   @binding.pattern   a destructuring pattern whose entries are bindings of the module
;   @binding.member    local name bound to one property of a required module, @binding.property is that property
;   @alias.local / @alias.value / @alias.pattern   a variable that aliases an existing binding
;   @callee            the function or constructor expression of a call or `new`

; ---- ES imports and re-exports -------------------------------------------------------------

(import_statement
  source: (string (string_fragment) @module))

(import_statement
  (import_clause (identifier) @binding.default)
  source: (string (string_fragment) @module))

(import_statement
  (import_clause (namespace_import (identifier) @binding.namespace))
  source: (string (string_fragment) @module))

(import_statement
  (import_clause
    (named_imports
      (import_specifier
        name: (_) @binding.name
        alias: (_)? @binding.alias)))
  source: (string (string_fragment) @module))

; export { a } from "m"; export * from "m"
(export_statement
  source: (string (string_fragment) @module))

; ---- CommonJS and dynamic import -----------------------------------------------------------

; require("m") anywhere, including inline and in expressions
(call_expression
  function: (identifier) @_require
  arguments: (arguments . (string (string_fragment) @module))
  (#eq? @_require "require"))

; const m = require("m")
(variable_declarator
  name: (identifier) @binding.namespace
  value: (call_expression
    function: (identifier) @_require
    arguments: (arguments . (string (string_fragment) @module)))
  (#eq? @_require "require"))

; const { a, b: c } = require("m")
(variable_declarator
  name: (object_pattern) @binding.pattern
  value: (call_expression
    function: (identifier) @_require
    arguments: (arguments . (string (string_fragment) @module)))
  (#eq? @_require "require"))

; const a = require("m").a
(variable_declarator
  name: (identifier) @binding.member
  value: (member_expression
    object: (call_expression
      function: (identifier) @_require
      arguments: (arguments . (string (string_fragment) @module)))
    property: (property_identifier) @binding.property)
  (#eq? @_require "require"))

; import("m")
(call_expression
  function: (import)
  arguments: (arguments . (string (string_fragment) @module)))

; const m = await import("m")
(variable_declarator
  name: (identifier) @binding.namespace
  value: (await_expression
    (call_expression
      function: (import)
      arguments: (arguments . (string (string_fragment) @module)))))

; const { a } = await import("m")
(variable_declarator
  name: (object_pattern) @binding.pattern
  value: (await_expression
    (call_expression
      function: (import)
      arguments: (arguments . (string (string_fragment) @module)))))

; ---- Aliases of an imported binding --------------------------------------------------------

; const get = request.get;  const r = request;
(variable_declarator
  name: (identifier) @alias.local
  value: (_) @alias.value)

; const { get, post: send } = request;
(variable_declarator
  name: (object_pattern) @alias.pattern
  value: (_) @alias.value)

; ---- Calls ---------------------------------------------------------------------------------

(call_expression
  function: (_) @callee)

(new_expression
  constructor: (_) @callee)
