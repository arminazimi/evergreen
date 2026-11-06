import { required } from "../../required.js";
import { parseSource } from "../../usage/tree-sitter.js";

import type { Declaration } from "./types.js";

/** Only literal keyword arguments to conventional setup calls are read; repository code is never run. */
export async function collectSetupRuntime(path: string, contents: string): Promise<Declaration[]> {
  const tree = await parseSource("python", contents);
  if (!tree) return [];
  try {
    if (tree.rootNode.hasError) return [];
    const declarations: Declaration[] = [];
    for (const call of tree.rootNode.descendantsOfType("call")) {
      if (
        !call ||
        !["setup", "setuptools.setup", "distutils.core.setup"].includes(call.childForFieldName("function")?.text ?? "")
      )
        continue;
      for (const argument of call.childForFieldName("arguments")?.namedChildren ?? []) {
        if (argument?.type !== "keyword_argument" || argument.childForFieldName("name")?.text !== "python_requires")
          continue;
        const literal = argument.childForFieldName("value");
        if (literal?.type !== "string") continue;
        const value = /^(?:'([^'\\\r\n]*)'|"([^"\\\r\n]*)")$/.exec(literal.text);
        if (value)
          declarations.push({
            path,
            line: argument.startPosition.row + 1,
            value: required(value[1] ?? value[2], "python_requires literal"),
            kind: "compatibility range",
          });
      }
    }
    return declarations;
  } finally {
    tree.delete();
  }
}
