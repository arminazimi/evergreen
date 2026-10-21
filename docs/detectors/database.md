# Database runtimes

The `database` detector reports database server versions that are past end of life, as declared in Compose files and in Terraform managed-database resources. It is **experimental**: it is not yet held to the precision floor that stable detectors are (see [Decision 0013](../decisions/0013-detector-maturity.md)). Its lifecycle rules are in `registry/database.json` and ship in the [data bundle](../DATA.md).

## What it reads

| File | Declaration |
| --- | --- |
| `compose.yaml`, `compose.yml`, `docker-compose.yml`, `docker-compose.yaml`, and variants such as `docker-compose.override.yml` | `services.<name>.image` when it is a Docker Hub official `postgres`, `mysql`, `mariadb`, `redis`, or `mongo` image with a literal tag |
| `*.tf` | `engine_version` on a top-level `resource` of type `aws_db_instance` (`postgres`, `mysql`, `mariadb`), `aws_rds_cluster` (`postgres`, `mysql`), `aws_elasticache_cluster`, or `aws_elasticache_replication_group` (`redis`), when `engine` and `engine_version` are both literal strings |

The image may be written as `postgres:12`, `docker.io/library/postgres:12`, or with a digest after the tag. The tag and the Terraform value are read as a leading `major`, `major.minor`, or `major.minor.patch`, optionally followed by a `-suffix` such as `-alpine` or `-bookworm`.

It walks the repository up to eight directories deep (at most 2,000 matching files) and does not follow symbolic links. It skips `.git`, `.terraform`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. Docker, Compose, and Terraform are never run, and nothing is fetched.

## What it reports

- A database version that falls in a release line the rules mark as end of life. The bundled rules cover **PostgreSQL 11, 12, and 13** and **MySQL 5.7 and 8.0**, all at **high** severity. PostgreSQL dates come from the [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/). The [MySQL lifecycle page](https://www.mysql.com/support/supportedplatforms/database.html) refuses automated requests, so the MySQL dates were taken from [endoflife.date](https://endoflife.date/mysql) when the rules were reviewed.
- MariaDB, Redis, and MongoDB declarations are read, but the registry has no rules for them yet, so they produce findings only after a rule is added. The `database-2` importer drafts Redis and MongoDB rules from endoflife.date and each vendor's own support policy for review.

Each finding carries its rule's sources, replacement, migration steps, and verification commands: back up the data, upgrade the data, raise the declared version, and check clients; then `docker compose config`, `terraform validate`, and `terraform plan`. The detector reports no source usages.

## How versions are matched

- A full version (`5.7.44`, `12.22.1`) uses the first rule whose `vers` range contains it.
- A partial version (`12`, `5.7`, `8.0-alpine`) could mean any release that starts with it, so it matches a rule only when the rule's range contains both ends of that span. `postgres:12` matches the PostgreSQL 12 rule; `mysql:5` matches no MySQL 5.7 rule, and `postgres:latest` or `postgres:alpine` carry no version and match nothing.
- A product only matches rules for its own Package URL: `pkg:generic/postgresql`, `pkg:generic/mysql`, `pkg:generic/mariadb`, `pkg:generic/redis`, and `pkg:generic/mongodb`. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.

## What it intentionally does not judge

- Variable and interpolated values (`${DB_IMAGE}`, `postgres:${PG_MAJOR:-17}`, `var.`, `local.`), and any `engine` or `engine_version` that is not a single literal string.
- Comments, strings that mention an image or `engine_version`, labels, `container_name`, environment variables such as `POSTGRES_VERSION`, extension keys, and `engine_version` in tags or on resources of other types. A `family` such as `postgres12` on a parameter group is not a version.
- Images without a tag, with only a digest, or from another registry or mirror (`ghcr.io/…`, `mirror.gcr.io/library/mysql:5.7`), and other publishers' images such as `bitnami/postgresql`.
- Compose files that use YAML aliases or merge keys (`<<: *shared`), and any file that does not parse: they produce nothing, not partial results.
- Terraform `module` blocks (including `terraform-aws-modules/rds`), `data` blocks, Aurora engines (`aurora-postgresql`, `aurora-mysql`), other clouds, `.tf.json` files, and `.tfvars` files.
- Vulnerability advisories, and whether a newer release exists.
- Oversized files (over 1 MiB, or a line over 4,096 characters in HCL) produce nothing.

## Known limits and false-positive boundaries

- A version is reported as end of life even when the project still works on it; Evergreen reports that the vendor no longer supports it, not that it fails. A `postgres:12` image used only for a short-lived integration test is reported like any other.
- The [container detector](container.md) also has end-of-life rules for the `postgres` and `mysql` images, so the same Compose line can appear twice, once under each detector, with different rule ids.
- Every file is read on its own: the same service can use different versions in `compose.yaml` and an override file, and findings in `examples/` or test directories are reported like any other.
- Redis (`redis:7`) and MongoDB major-only tags are not matched against `major.minor` rules, so a floating major tag is never reported as an old release.
- A repository with more than 2,000 matching files is read only up to that limit, in sorted path order.

## Evidence

Five public repositories are pinned in `benchmarks/public-repositories.json` under the `database` ecosystem: four targeted repositories with Compose or Terraform declarations and one blind, zero-finding repository. Their ground truth cites the vendors' lifecycle sources, not Evergreen output. Precision on this corpus does not establish coverage of the unsupported forms above.
