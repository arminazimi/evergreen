# GitLab CI/CD Catalog

Maintainer runbook for publishing the [GitLab component](GITLAB.md) to the CI/CD Catalog. The root `.gitlab-ci.yml` tests the component on every pipeline and publishes a catalog release when a `vX.Y.Z` tag is pushed.

## One-time setup

1. Create a public GitLab project and give it a description (the Catalog requires one).
2. Mirror this repository into it: **Settings → Repository → Mirroring repositories**, direction **Pull**, with the GitHub URL. Mirror tags too.
3. Turn on **Settings → General → Visibility → CI/CD Catalog resource**.
4. Confirm the project root has `templates/evergreen.yml` and `README.md`.

## Release

1. Tag `vX.Y.Z` on GitHub as usual (see the release checklist). The mirror pulls the tag.
2. The `publish` job creates the release `X.Y.Z` (no `v`, as the Catalog requires), which lists the version in the Catalog.
3. Open the Catalog entry and check the inputs table renders and that the usage snippet works in a scratch project:

```yaml
include:
  - component: $CI_SERVER_FQDN/<group>/<project>/evergreen@X.Y.Z
```

The component's default `version` input must equal the `evergreen-deprecation` version published to npm for the same tag; `tests/gitlab-component.test.ts` enforces this.
