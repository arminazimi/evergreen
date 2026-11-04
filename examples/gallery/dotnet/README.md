# .NET example

Retired .NET runtimes and the deprecated WindowsAzure.Storage package. This directory holds the smallest files that make the dotnet detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/dotnet scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/dotnet scan --format json
```

The scan is offline and reads the files only.
