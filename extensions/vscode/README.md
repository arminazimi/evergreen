# Evergreen for VS Code

Runs the installed [Evergreen](https://github.com/arminazimi/evergreen) CLI for a workspace folder and shows its output. The extension does not bundle the CLI, and it makes no network calls or telemetry.

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

## Use

Run **Evergreen: Scan workspace** from the Command Palette. The extension runs:

```bash
evergreen scan --json <workspace-folder>
```

The command output is written to the **Evergreen** output channel, followed by a one-line finding count.

If the CLI is not on `PATH`, set `evergreen.executablePath` in your settings to its full path. A missing CLI shows a single error message with the install command.

## Tests

```bash
npm test
```

The unit tests run with Node's built-in test runner and do not need a VS Code window.

## Notes

- Scans are local. The extension passes the workspace folder to the CLI and reads its JSON; it never uploads repository contents.
- The CLI only runs when the workspace is trusted. In Restricted Mode the extension stays inert and explains how to trust the workspace.
- This extension is not published to the Marketplace yet.
