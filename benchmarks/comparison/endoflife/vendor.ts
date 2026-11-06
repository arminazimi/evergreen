// Reads the vendor-checked date out of a corpus note.
//
// The note written by the ground-truth audit says which day it was checked and, when the vendor page gave
// one, the lifecycle date it confirmed. Removing the check date leaves exactly one date for the records the
// audit checked; records with no lifecycle date, or more than one, are reported as having no extractable date
// rather than guessed.

const ISO_DATE = /\b20\d{2}-\d{2}-\d{2}\b/g;
const CHECKED_ON = /vendor-checked[^.]*?\bon (20\d{2}-\d{2}-\d{2})/gi;

/** The lifecycle date a vendor-checked note confirms, or undefined when the note does not name exactly one. */
export function vendorCheckedDate(note: string | undefined): string | undefined {
  if (!note || !/vendor-checked/i.test(note)) return undefined;
  const checkedOn = new Set([...note.matchAll(CHECKED_ON)].map((match) => match[1]));
  const dates = [...new Set(note.match(ISO_DATE) ?? [])].filter((date) => !checkedOn.has(date));
  return dates.length === 1 ? dates[0] : undefined;
}
