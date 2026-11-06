import { renderDiff } from "../../../agent-instructions.js";
import type { FilePatch } from "../../types.js";

/** One replacement of a source range, by character offsets. */
export interface Edit {
  start: number;
  end: number;
  replacement: string;
}

/** Applies edits from the end of the file backwards so earlier offsets stay valid; same-start edits apply shortest first. */
export function applyEdits(source: string, edits: readonly Edit[]): string {
  let text = source;
  for (const edit of [...edits].sort((left, right) => right.start - left.start || left.end - right.end)) {
    text = `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
  }
  return text;
}

/** The patch that turns `before` into `after`, or undefined when the text is unchanged. */
export function diffFor(path: string, before: string, after: string): FilePatch | undefined {
  if (after === before) return undefined;
  // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
  return { path, diff: renderDiff(path, before.slice(0, -1), after.slice(0, -1)) };
}

/** The patch for a file whose edits changed it, or undefined when no edit applies. */
export function patchFor(path: string, before: string, edits: readonly Edit[]): FilePatch | undefined {
  return edits.length === 0 ? undefined : diffFor(path, before, applyEdits(before, edits));
}
