# Lifecycle importers

An importer reads one authoritative, machine-readable source and drafts [lifecycle rules](RULES.md) from it, so the rules grow from sources instead of being typed in by hand. Importers are maintainer tooling: scans never run them and never use the network. The decision behind them is [Decision 0005](decisions/0005-lifecycle-importers.md).

The importers moved with the rules to [Ebb](https://github.com/velella-sh/ebb), the open lifecycle dataset Evergreen reads. How they work, how to run one, and how to add a source are in Ebb's [importers guide](https://github.com/velella-sh/ebb/blob/main/docs/IMPORTERS.md).
