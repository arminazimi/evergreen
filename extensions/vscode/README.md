# Evergreen for VS Code

Shows [Evergreen](https://github.com/arminazimi/evergreen) lifecycle findings as inline diagnostics using the installed CLI. The extension does not bundle the CLI, and it makes no network calls or telemetry.

## Requirements

- VS Code 1.85 or newer.
- Node.js 22 or newer to build the extension.
- The Evergreen CLI installed and on `PATH`:

  ```bash
  npm install -g evergreen-deprecation
  ```

  Check it with `evergreen --version`.

## Build and run

```bash
cd extensions/vscode
npm ci
npm run build
```

Open the `extensions/vscode` folder in VS Code and press F5 (Run Extension). Alternatively:

```bash
code --extensionDevelopmentPath="$(pwd)"
```

## Package

```bash
cd extensions/vscode
npm ci
npm run package
```

This builds the extension and writes `evergreen-vscode-<version>.vsix` into `extensions/vscode`. The package runs offline and contains only the compiled extension, `package.json`, `README.md`, `LICENSE.txt`, and the icon. Install it locally with `code --install-extension evergreen-vscode-<version>.vsix`.

## Use

Saving a file scans the workspace folder that contains it when `evergreen.runOnSave` is true (the default) and the workspace is trusted. The extension runs:

```bash
evergreen scan --json <workspace-folder>
```

Each finding becomes a diagnostic at its exact location:

- The path and line come from the finding; the column is used when present. A finding without a line is placed on the first line of its file.
- Severity maps as `critical`/`high` to Error, `medium` to Warning, and `low`/`info` to Information.
- The diagnostic code is the rule id, linked to the first source URL.
- The diagnostic source is **Evergreen**.

Old diagnostics for the folder are cleared before new ones are added, so fixed problems disappear on the next save. Only one scan runs per folder at a time; saves that arrive during a scan schedule one rerun.

Run **Evergreen: Scan workspace** from the Command Palette to scan immediately. The CLI output is written to the **Evergreen** output channel.

Select **Evergreen: explain this finding** from a diagnostic's quick actions, or run the command with the cursor on a diagnostic. It runs:

```bash
evergreen context <finding-id> <workspace-folder>
```

and shows the migration context in the **Evergreen** output channel.

## Settings

| Setting | Default | Description |
|---|---|---|
| `evergreen.executablePath` | `evergreen` | Path to the Evergreen CLI. |
| `evergreen.runOnSave` | `true` | Scan the workspace folder when a file is saved. |

If the CLI is not on `PATH`, set `evergreen.executablePath` to its full path. A missing CLI shows one error message with the install command.

## Tests

```bash
npm test
```

The unit tests run with Node's built-in test runner and do not need a VS Code window. The mapping test uses a recorded real scan of `tests/fixtures/dotnet/positive`, stored in `src/test/fixtures/dotnet-positive.json`. Regenerate it after building the CLI at the repository root:

```bash
npm run build
node extensions/vscode/scripts/record-fixtures.mjs
```

The recorder only normalizes the machine-specific `root` field; findings, locations, severities, and sources are exactly what the CLI printed.

## Notes

- Scans are local. The extension passes the workspace folder to the CLI and reads its JSON; it never uploads repository contents.
- The CLI only runs when the workspace is trusted. In Restricted Mode the extension stays inert and explains how to trust the workspace.
- This extension is not published to the Marketplace yet.
