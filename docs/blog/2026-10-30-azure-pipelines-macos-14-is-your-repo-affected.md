---
title: "Is your repo affected? Azure Pipelines macOS 14 removal on 2026-11-02"
---

# Is your repo affected? Azure Pipelines macOS 14 removal on 2026-11-02

Microsoft's hosted image deprecation schedule removes the **macOS 14 Sonoma** image on **2026-11-02**. Deprecation started on 2026-07-06. Pipelines that still set `pool.vmImage` to `macos-14` need to move to `macos-latest` or `macos-15` before removal.

## Who is affected

Azure Pipelines YAML that pins Microsoft-hosted agents to `macos-14`, including stage and job pools. This schedule does **not** apply to self-hosted macOS 14 agents. The `ci-images` detector reports Microsoft-hosted `pool.vmImage` labels that match.

## Check your repository

```bash
npx evergreen-deprecation scan
```

Look for rule `ci-images.azure-pipelines.macos-14`. For a single Package URL check:

```bash
npx evergreen-deprecation check pkg:generic/azure-pipelines/macos-image@14
```

## Migration steps

Replacement: `macos-latest` or `macos-15`.

1. **Retarget the hosted image.** Change the reported `pool.vmImage` from `macos-14` to `macos-latest` or `macos-15`.
2. **Align other Azure Pipelines pools.** Update every other `azure-pipelines.yml` pool that still pins `macos-14`. Leave self-hosted pool names unchanged.

Azure Pipelines has no local image validator equivalent to some other CI linters: queue the pipeline and confirm the job uses the replacement `vmImage`. Details are on the [rule page](../rules/ci-images.azure-pipelines.macos-14.md).

## Sources

- [Microsoft-hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule)
- Rule: [`ci-images.azure-pipelines.macos-14`](../rules/ci-images.azure-pipelines.macos-14.md)

Every claim above comes from the linked source and the reviewed rule. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
