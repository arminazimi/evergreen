/** A value the surrounding parse requires; checked instead of asserted with `!`. */
export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}
