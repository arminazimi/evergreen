/** Markdown rendering helpers shared by the tools. */

/**
 * Escape text for one Markdown table cell.
 *
 * The backslash goes first: this replacement introduces backslashes, so an input backslash left alone
 * could combine with the added one (for example `\|` would become `\\|` and end the cell early). After
 * that every pipe is escaped and every line break becomes a space, so the text cannot split the row.
 */
export function escapeTableCell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r\n|[\r\n]/g, " ");
}
