const checkoutIgnoredSegments = new Set(["vendor", "fixtures", "__fixtures__", "testdata"]);

/** Dependency checkouts and fixture trees are not the project's own source. */
export function checkoutSourceIgnored(path: string): boolean {
  return path.split("/").some((segment) => checkoutIgnoredSegments.has(segment));
}
