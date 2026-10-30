# Container fixtures

These fixtures define the parser boundary for container base-image declarations
(see [decision 0007](../../../docs/decisions/0007-container-detector.md)). Parsers
return exact one-based line numbers, ignore dynamic or unsupported forms, and
never throw for malformed input.

| Fixture | Expected case |
| --- | --- |
| `positive/Dockerfile` | Literal `FROM` lines: a tagged image with a stage name, one with `--platform`, and a fully qualified Docker Hub reference. |
| `positive/api.Dockerfile` | A `*.Dockerfile` name with a patch-level tag and variant suffix. |
| `positive/Containerfile` | A tag plus digest; the tag is classified, the digest is kept as evidence. |
| `positive/compose.yaml` | `services.*.image` entries, quoted and unquoted; the `build`-only service has none. |
| `positive/docker-compose.yml` | The legacy Compose file name with a fully qualified image. |
| `positive/redis.Dockerfile` | A Redis release line whose scheduled end of life is `2027-04-01`. |
| `negative/Dockerfile` | Comments, build arguments, variables, `latest`, no tag, digest-only, `scratch`, a supported release line, a reference to an earlier stage, and `FROM` inside a `RUN` string produce no findings. |
| `negative/compose.yaml` | Variable interpolation, `container_name`, `labels`, a top-level extension key, `latest`, and a supported release line produce no findings. |
| `zero/Dockerfile` | A valid file with only a supported base image produces no findings. |
| `zero/compose.yaml` | A valid Compose file without any `image:` key produces no findings. |
| `malformed/Dockerfile` | A truncated `FROM` and a dangling line continuation are handled without throwing. |
| `malformed/compose.yaml` | Invalid YAML is handled without throwing or returning partial declarations. |
