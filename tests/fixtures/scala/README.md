# Scala fixtures

Each directory here is a small repository that the scala detector scans in `tests/scala-detector.test.ts`.

| Directory | Contains | Expected |
| --- | --- | --- |
| `positive/` | End-of-life Scala 2.11 and sbt 0.13 pins | findings for those declarations |
| `negative/` | Supported Scala 2.13 and sbt 1.x pins | no findings |
| `zero/` | Supported Scala 3.3 LTS and sbt 1.x pins | no findings |
| `malformed/` | Broken or unsupported declarations | no findings, and no crash |

Keep fixtures tiny, and write only what the detector reads. Fixtures are scanned as untrusted input.
