# Go module and vendored requirements

`go.mod` declares `go 1.23`, and `vendor/modules.txt` records that `example.com/lib v1.4.0` declares `go 1.24`. Moving to Go 1.22 is blocked by both the module's own minimum and a vendored dependency's minimum:

```bash
node dist/tools/examples.js upgrade/go-modules upgrade-check --to go@1.22
```

Both issues point at the exact line and value, and the command exits `1`. Nothing is installed, built, or downloaded.
