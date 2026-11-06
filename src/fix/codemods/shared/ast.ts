import type { Node } from "../../../usage/vendor/tree-sitter/tree-sitter.js";

/** The named children of a node, with the holes a partial parse leaves between them removed. */
export function namedChildNodes(node: Node): Node[] {
  return node.namedChildren.filter((child): child is Node => child !== null);
}

/**
 * Calls and constructions keyed by the offset where their callee starts, which is the location a symbol usage
 * reports.
 */
export function callsByCallee(root: Node, types: string | string[] = "call_expression"): Map<number, Node[]> {
  const calls = new Map<number, Node[]>();
  for (const node of root.descendantsOfType(types)) {
    if (!node) continue;
    const callee = node.childForFieldName("function") ?? node.childForFieldName("constructor");
    if (!callee) continue;
    const list = calls.get(callee.startIndex) ?? [];
    list.push(node);
    calls.set(callee.startIndex, list);
  }
  return calls;
}
