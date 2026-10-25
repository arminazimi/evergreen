# Migration packets

`evergreen context <finding-id>` converts one scan finding into a portable plan for a human or coding agent. Add `--json` for the versioned `evergreen.context.v1` representation.

```bash
npx evergreen-deprecation scan . --json
npx evergreen-deprecation context '<finding-id>' . --json
```

## Packet contents

- The complete lifecycle finding and authoritative sources.
- The declaration file plus exact import, call, and configuration usages.
- Rule-specific behavioral and compatibility constraints.
- A warning when the replacement needs a newer Node.js or Python than the repository pins in `.nvmrc`, `.node-version`, `.python-version`, or `.tool-versions`.
- Ordered migration steps resolved to declaration, usage, or all affected paths.
- Suggested ecosystem verification commands and a final Evergreen re-scan.

Built-in registry rules carry reviewed migration guidance next to their lifecycle evidence. This keeps the scan engine and CLI independent of ecosystem-specific migration knowledge. External detectors can provide the same optional guidance through the detector SDK; otherwise Evergreen emits a conservative generic packet.

## Safety and determinism

Evergreen generates context but never edits files or executes verification commands. Packet generation is local, deterministic for a scan result, and does not require an LLM or network access.

The runtime validator checks more than field types: packet sources and usages must equal the finding evidence, affected files must be derived from those locations, step IDs and commands must be unique, and every step path must stay inside the affected-file set. The JSON contract is published at `schemas/context.v1.schema.json`.

Suggested commands may require project-specific setup and should be reviewed before execution. A migration is complete only after the relevant repository tests pass and a fresh Evergreen scan no longer reports the finding.
