/**
 * Crates the `rust-2` importer checks for yanked versions. crates.io has no list of yanked versions across crates,
 * so the importer reads each candidate's index entry. Add a crate by name in a pull request, sorted; adding one
 * also adds its index response to the recording (`tests/importers/recordings/rust-2.json`), which stays small
 * because each response is the crate's whole version list.
 */
export const RUST_CRATE_CANDIDATES: readonly string[] = ["bytes", "memchr", "once_cell", "smallvec", "tempfile", "tower"];
