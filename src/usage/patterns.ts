/** Escape a string so it can be used literally inside a regular expression. */
export function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
