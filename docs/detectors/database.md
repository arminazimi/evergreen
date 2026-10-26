# Database runtimes

The `database` detector reports database server versions that are past end of life, as declared in Compose files and in Terraform managed-database resources on AWS, Azure, and Google Cloud. It is **experimental**: it is not yet held to the precision floor that stable detectors are (see [Decision 0013](../decisions/0013-detector-maturity.md)). Its lifecycle rules are in `registry/database.json` and ship in the [data bundle](../DATA.md).

## What it reads

| File | Declaration |
| --- | --- |
| `compose.yaml`, `compose.yml`, `docker-compose.yml`, `docker-compose.yaml`, and variants such as `docker-compose.override.yml` | `services.<name>.image` when it is a Docker Hub official `postgres`, `mysql`, `mariadb`, `redis`, or `mongo` image with a literal tag |
| `*.tf` | `engine` and `engine_version` on a top-level `aws_db_instance` (`postgres`, `mysql`, `mariadb`), `aws_rds_cluster` (`postgres`, `mysql`), `aws_elasticache_cluster`, or `aws_elasticache_replication_group` (`redis`), when both are literal strings |
| `*.tf` | `version` on a top-level `azurerm_postgresql_server`, `azurerm_postgresql_flexible_server`, `azurerm_mysql_server`, `azurerm_mysql_flexible_server`, or `azurerm_mariadb_server` |
| `*.tf` | `database_version` on a top-level `google_sql_database_instance` or `google_sql_source_representation_instance`; the value names the engine and version, for example `POSTGRES_9_6` or `MYSQL_8_0` |

The image may be written as `postgres:12`, `docker.io/library/postgres:12`, or with a digest after the tag. The tag, the Azure `version`, and the AWS `engine_version` are read as a leading `major`, `major.minor`, or `major.minor.patch`, optionally followed by a `-suffix` such as `-alpine` or `-bookworm`. A Google Cloud SQL `database_version` is decoded from its `POSTGRES_` or `MYSQL_` form (`POSTGRES_9_6` becomes `9.6`).

A version attribute that is a variable, a local reference, a call, or an interpolation (`var.pg_version`, `local.mysql_version`, `"${var.major}"`, `format(...)`) produces no finding and is listed as unclassified at its line. Its value is never evaluated.

It walks the repository up to eight directories deep (at most 2,000 matching files) and does not follow symbolic links. It skips `.git`, `.terraform`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. Docker, Compose, and Terraform are never run, and nothing is fetched.

## What it reports

- A database version that falls in a release line the rules mark as end of life or end of support. The bundled rules cover:
  - **PostgreSQL 11, 12, and 13** and **MySQL 5.7 and 8.0** in Compose images and AWS managed databases, all at **high** severity. PostgreSQL dates come from the [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/). The [MySQL lifecycle page](https://www.mysql.com/support/supportedplatforms/database.html) refuses automated requests, so the MySQL dates were taken from [endoflife.date](https://endoflife.date/mysql) when the rules were reviewed.
  - **Azure Database for PostgreSQL 11 through 13**, whose [standard support ended on 2026-07-31](https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-version-policy), and **Azure Database for MySQL 5.7**, whose [standard support ended on 2026-09-30](https://learn.microsoft.com/azure/mysql/flexible-server/concepts-supported-versions), at **high** severity. Azure keeps those versions running in Extended Support, which is time-boxed.
  - **Cloud SQL for PostgreSQL 9.6 through 13** and **Cloud SQL for MySQL 5.6 and 5.7**, which the [PostgreSQL](https://cloud.google.com/sql/docs/postgres/db-versions) and [MySQL](https://cloud.google.com/sql/docs/mysql/db-versions) version policies list in extended support after the upstream community end of life, at **high** severity.
- MariaDB and Redis declarations are read, but the registry has no rules for them yet, so they produce findings only after a rule is added. The `database-2` importer drafts Redis and MongoDB rules from endoflife.date and each vendor's own support policy for review.

Each finding carries its rule's sources, replacement, migration steps, and verification commands. The generic and AWS rules use back up the data, upgrade the data, raise the declared version, and check clients, then `docker compose config`, `terraform validate`, and `terraform plan`. The Azure and Google Cloud rules add the vendor's own check (`az postgres flexible-server list`, `az mysql flexible-server list`, or `gcloud sql instances list`). The detector reports no source usages.

## How versions are matched

- A full version (`5.7.44`, `12.22.1`) uses the first rule whose `vers` range contains it.
- A partial version (`12`, `5.7`, `8.0-alpine`) could mean any release that starts with it, so it matches a rule only when the rule's range contains both ends of that span. `postgres:12` matches the PostgreSQL 12 rule; `mysql:5` matches no MySQL 5.7 rule, and `postgres:latest` or `postgres:alpine` carry no version and match nothing.
- A product only matches rules for its own Package URL: `pkg:generic/postgresql`, `pkg:generic/mysql`, `pkg:generic/mariadb`, `pkg:generic/redis`, and `pkg:generic/mongodb`. AWS resources use those upstream products. Azure resources use `pkg:generic/azure-database-postgresql`, `pkg:generic/azure-database-mysql`, or `pkg:generic/azure-database-mariadb`; Google Cloud SQL resources use `pkg:generic/google-cloud-sql-postgresql` or `pkg:generic/google-cloud-sql-mysql`. A cloud rule therefore matches only the managed service whose support page states that date, while an AWS declaration still uses the upstream rule.
- A rule whose `vers` is malformed is skipped, so it does not hide a later rule.

## What it intentionally does not judge

- Variable and interpolated values (`${DB_IMAGE}`, `postgres:${PG_MAJOR:-17}`, `var.`, `local.`) in Compose, and any version attribute that is not a single literal string. The Terraform ones are listed as unclassified; Compose values are not read.
- Comments, strings that mention an image or `engine_version`, labels, `container_name`, environment variables such as `POSTGRES_VERSION`, extension keys, and `engine_version` in tags or on resources of other types. A `family` such as `postgres12` on a parameter group is not a version.
- Images without a tag, with only a digest, or from another registry or mirror (`ghcr.io/…`, `mirror.gcr.io/library/mysql:5.7`), and other publishers' images such as `bitnami/postgresql`.
- Compose files that use YAML aliases or merge keys (`<<: *shared`), and any file that does not parse: they produce nothing, not partial results.
- Terraform `module` blocks (including `terraform-aws-modules/rds`), `data` blocks, Aurora engines (`aurora-postgresql`, `aurora-mysql`), `azurerm_*` resources other than the five database resources above, and Google Cloud SQL `SQLSERVER_*` versions.
- Compose image declarations for Azure and Google Cloud managed services: those services are judged only from Terraform.
- Terraform `.tf.json` files and `.tfvars` files.
- Vulnerability advisories, and whether a newer release exists.
- Oversized files (over 1 MiB, or a line over 4,096 characters in HCL) produce nothing.

## Known limits and false-positive boundaries

- A version is reported as end of life or past support even when the project still works on it; Evergreen reports that the vendor no longer supports it, not that it fails. A `postgres:12` image used only for a short-lived integration test is reported like any other.
- An Azure or Google Cloud finding reports the vendor's standard-support or extended-support transition date. It does not report which individual server is already enrolled in paid extended support.
- The [container detector](container.md) also has end-of-life rules for the `postgres` and `mysql` images, so the same Compose line can appear twice, once under each detector, with different rule ids.
- Every file is read on its own: the same service can use different versions in `compose.yaml` and an override file, and findings in `examples/` or test directories are reported like any other.
- Redis (`redis:7`) and MongoDB major-only tags are not matched against `major.minor` rules, so a floating major tag is never reported as an old release.
- A repository with more than 2,000 matching files is read only up to that limit, in sorted path order.

## Evidence

Five public repositories are pinned in `benchmarks/public-repositories.json` under the `database` ecosystem: four targeted repositories with Compose or Terraform declarations and one blind, zero-finding repository. Their ground truth cites the vendors' lifecycle sources, not Evergreen output. Precision on this corpus does not establish coverage of the unsupported forms above.
