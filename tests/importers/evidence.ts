/**
 * Sources without the retrieval date the runner stamps. Importer tests compare the evidence an importer
 * produces with a committed rule; the run date is the runner's, not the importer's, so it is not part of
 * that comparison.
 */
export function withoutAccessDates<T extends { accessedAt?: string }>(
  sources: readonly T[],
): Array<Omit<T, "accessedAt">> {
  return sources.map(({ accessedAt: _accessedAt, ...source }) => source);
}
