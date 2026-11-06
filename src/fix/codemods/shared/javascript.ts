import type { Node } from "../../../usage/vendor/tree-sitter/tree-sitter.js";

/**
 * `os.tmpDir?.()` puts the chain on the call in the JavaScript grammar but drops the node in the TypeScript
 * grammar, so the `?.` is also read from the source between the callee and its arguments.
 */
export function optionalCall(call: Node, callee: Node, source: string): boolean {
  if (call.childForFieldName("optional_chain") !== null) return true;
  const args = call.childForFieldName("arguments");
  const gap = args ? source.slice(callee.endIndex, args.startIndex) : "";
  return source.slice(callee.startIndex, callee.endIndex).includes("?.") || gap.includes("?.");
}

/** The module `require("m")` reads, including the `node:` prefix, or undefined for any other expression. */
export function requiredModule(node: Node | null | undefined): string | undefined {
  if (node?.type !== "call_expression") return undefined;
  const callee = node.childForFieldName("function");
  if (callee?.type !== "identifier" || callee.text !== "require") return undefined;
  const argument = node.childForFieldName("arguments")?.namedChildren[0];
  return argument?.type === "string" ? normalizeModule(unquote(argument.text)) : undefined;
}

/** A module specifier without the `node:` prefix, which names the same built-in module. */
export function normalizeModule(module: string): string {
  return module.startsWith("node:") ? module.slice(5) : module;
}

/** The text of a string literal without its surrounding quote. */
export function unquote(text: string): string {
  return text.replace(/^["'`]|["'`]$/g, "");
}
