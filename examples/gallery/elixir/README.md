# Elixir example

Elixir 1.14, Erlang 25, and a retired Hex package. This directory holds the smallest files that make the elixir detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/elixir
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/elixir --format json
```

The scan is offline and reads the files only.
