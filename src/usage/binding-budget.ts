/** Shared ceiling for tree-sitter usage analysis so one generated file cannot exhaust the heap. */

export const maximumImportBindings = 1_024;

export interface ImportBinding {
  module: string;
  local: string;
  imported: string;
}

export interface AliasCapture<Node> {
  local: string | undefined;
  pattern: Node | undefined;
  value: Node;
}

/**
 * Collects import bindings, alias captures, and callees. Alias and callee lists are unbounded:
 * ordinary files with hundreds of `const` lines or call sites must not be marked incomplete.
 * {@link BindingBudget.capped} is set only when a new binding is refused because the ceiling was
 * hit while rebinding still had work to do.
 */
export class BindingBudget<Node = unknown> {
  readonly bindings: ImportBinding[] = [];
  readonly aliases: AliasCapture<Node>[] = [];
  readonly callees: Node[] = [];
  private readonly seenBindings = new Set<string>();
  capped = false;

  addBinding(binding: ImportBinding): boolean {
    const key = `${binding.module}\0${binding.local}\0${binding.imported}`;
    if (this.seenBindings.has(key)) return false;
    if (this.bindings.length >= maximumImportBindings) {
      // Refused a distinct binding that still needed recording — analysis is incomplete.
      this.capped = true;
      return false;
    }
    this.seenBindings.add(key);
    this.bindings.push(binding);
    return true;
  }

  addAlias(alias: AliasCapture<Node>): void {
    this.aliases.push(alias);
  }

  addCallee(node: Node): void {
    this.callees.push(node);
  }
}

/** One human-readable skip line for a file whose usage analysis hit a budget. */
export function usageAnalysisSkip(path: string): string {
  return `${path}: usage analysis capped so a minified or generated file cannot exhaust memory; import and call matches in this file may be incomplete`;
}

/** Appends {@link usageAnalysisSkip} when analysis was capped and the caller wants skips recorded. */
export function noteCappedUsage(skips: string[] | undefined, path: string, capped: boolean | undefined): void {
  if (capped && skips) skips.push(usageAnalysisSkip(path));
}
