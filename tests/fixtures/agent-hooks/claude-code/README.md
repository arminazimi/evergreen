# Claude Code hook fixtures

Payloads captured from Claude Code 2.1.316 (`PostToolUse`), with session ids, transcript paths, and
home directories anonymized. `repo/Dockerfile.template` stands in for a fixture repository: the test
substitutes `{{NODE_LINE}}` with `16`, so the committed tree never carries an end-of-life image tag for
the repository's own self-scan to report.

- `write.json`, `edit.json`, `multiedit.json` — one payload per tool the hook handles.
- `bash.json` — a tool the hook must ignore.
- `settings-with-guard.json` — an existing `.claude/settings.json` with the pre-install guard and a user hook.
