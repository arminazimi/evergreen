/** The reason codes Ebb's errors carry. Callers map them to their own failure classes; a code is never renamed. */
export const EBB_ERROR_CODES = ["invalid-purl", "invalid-data-version", "data-unavailable", "data-update-failed"] as const;
export type EbbErrorCode = (typeof EBB_ERROR_CODES)[number];

/** An error with a stable reason code. Every error Ebb throws on purpose extends it. */
export class EbbError extends Error {
  readonly code: EbbErrorCode;

  constructor(code: EbbErrorCode, message: string) {
    super(message);
    this.name = "EbbError";
    this.code = code;
  }
}
