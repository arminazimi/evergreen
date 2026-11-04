# Dart SDK blocker example

A resolved package set that requires a newer Dart SDK than the target.

```bash
node dist/tools/examples.js upgrade/dart-sdk upgrade-check --to dart@3.5
```

`pubspec.lock` records `dart: ">=3.6.0 <4.0.0"` for the resolved package set, so the target `3.5.0` is a blocker.
