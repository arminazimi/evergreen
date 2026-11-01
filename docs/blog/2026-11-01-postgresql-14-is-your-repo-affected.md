---
title: "Is your repo affected? PostgreSQL 14 reaches end of life on 2026-11-12"
---

# Is your repo affected? PostgreSQL 14 reaches end of life on 2026-11-12

The PostgreSQL Global Development Group lists **PostgreSQL 14** as supported until its final release on **November 12, 2026**, after which it receives no further bug or security fixes. A database image tag or managed `engine_version` on the 14 line will then run unsupported software.

## Who is affected

Repositories that declare a PostgreSQL 14 image tag in a Compose file, or `engine_version` 14 on an AWS managed database in Terraform. The [`database`](../detectors/database.md) detector reports those declarations. The `container` detector also reports `postgres:14` base images in Dockerfiles and Compose files with its own rule, so the same Compose line can appear twice.

## Check your repository

```bash
npx evergreen-deprecation scan
```

Look for rules `database.postgresql.end-of-life-14` and `container.postgres.eol-14-and-older`.

## Migration steps

Replacement: PostgreSQL 16 or later.

1. **Back up the data first.** Take a verified backup or snapshot of every PostgreSQL instance in the reported files before changing any version. A major version change is not reversible by changing the version back.
2. **Upgrade the database cluster.** Run the upgrade with `pg_upgrade` or restore a dump into a new instance on the target major version. On a managed database, upgrade through a snapshot restore or a reviewed `engine_version` change with `allow_major_version_upgrade`.
3. **Raise the declared version.** Change the image tag in Compose files, or `engine_version` in Terraform, in every file and environment that runs this database, not only the reported line.
4. **Check clients and tooling.** Update drivers, ORMs, CI service containers, and local setup documentation that assume the old PostgreSQL version.

Then verify with `docker compose config`, `terraform validate`, and `terraform plan`. Full constraints and verification commands are on the [rule page](../rules/database.postgresql.end-of-life-14.md).

## Sources

- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- Rules: [`database.postgresql.end-of-life-14`](../rules/database.postgresql.end-of-life-14.md), [`container.postgres.eol-14-and-older`](../rules/container.postgres.eol-14-and-older.md)

Every claim above comes from the linked source and the reviewed rules. The [lifecycle calendar](../EOL_CALENDAR.md) lists what ends next.
