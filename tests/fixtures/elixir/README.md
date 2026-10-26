# Elixir fixtures

Each directory here is a small repository that the elixir detector scans in `tests/elixir-detector.test.ts`.

| Directory | Contains | Expected |
| --- | --- | --- |
| `positive/` | End-of-life Elixir and OTP pins, plus the retired Hex package `fennec` | findings for those declarations |
| `negative/` | Supported Elixir and OTP pins, and a maintained Hex package | no findings |
| `zero/` | Supported pins with no retired packages | no findings |
| `malformed/` | Broken or truncated Mix declarations | no findings, and no crash |

Keep fixtures tiny, and write only what the detector reads. Fixtures are scanned as untrusted input.
