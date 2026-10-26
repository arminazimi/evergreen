# Database runtime fixtures

These fixtures define the parser boundary for database runtime declarations in [epic #51](https://github.com/arminazimi/evergreen/issues/51). They cover the `postgres` and `mysql` forms of the `image` in `compose.yaml`, and of `engine` and `engine_version` on `aws_db_instance` in `*.tf`. The `docker-compose.yml` file name, and the `mariadb`, `redis`, and `mongo` images from the epic, have no fixture here. Line numbers below are 1-based and count comments and blank lines.

The release lines are parser examples. A lifecycle finding needs a reviewed rule with an authoritative source ([PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/), [MySQL lifecycle](https://www.mysql.com/support/supportedplatforms/database.html)). Positive files use PostgreSQL 12 and MySQL 5.7, which those sources list as end of life, so a later reviewed rule can match them. This task does not add those rules, so no findings are produced yet. Zero files use PostgreSQL 17 and MySQL 8.4, which the same sources list as supported.

Dynamic, commented, and lookalike values never produce a declaration or a finding, and never raise an error. A Terraform version attribute that is a variable, call, or interpolation is returned as unclassified at its line instead. A file with a syntax error returns nothing, including from lines that appear before the error.

| Fixture file | Expected case |
| --- | --- |
| `positive/compose.yaml` | `services.db.image` `postgres:12` (line 3) and quoted `services.legacy.image` `mysql:5.7` (line 7). `environment` (lines 4–5) and the `build`-only `web` service (lines 8–9) are not image declarations. |
| `positive/main.tf` | `aws_db_instance.orders` `engine` `postgres` (line 3) with `engine_version` `12.22` (line 4). `identifier`, `instance_class`, and `allocated_storage` are not declarations. |
| `negative/compose.yaml` | A comment (line 1), an image with a variable tag (line 4), `container_name` (line 5), an env var named `POSTGRES_VERSION` (line 7), an image set to `${DB_IMAGE}` (line 9), a `labels` key named `image` (line 11), an unrelated `nginx` image (line 13), and a top-level extension key with an image-looking string (line 14) produce no declarations. |
| `negative/main.tf` | A comment (line 1), `engine` and `engine_version` read from variables (lines 4–5), an `engine_version` built from an interpolation (line 13), `family = "postgres12"` on `aws_db_parameter_group` (line 19), a description that mentions `engine_version` (line 20), and an `engine_version` tag on `aws_instance` (line 26) produce no declarations; the two `aws_db_instance` resources return their variable attributes (lines 4, 5, and 13) as unclassified. |
| `zero/compose.yaml` | `services.db.image` `postgres:17` (line 3) and quoted `services.cache.image` `mysql:8.4` (line 7): valid declarations, no lifecycle finding. |
| `zero/main.tf` | `aws_db_instance.orders` `engine_version` `17.4` (line 4) and `aws_db_instance.catalog` `engine_version` `8.4.3` (line 12): valid declarations, no lifecycle finding. |
| `malformed/compose.yaml` | An unterminated flow sequence on `environment` (line 4) makes the document invalid. The `postgres:12` image on line 3 is not returned. No error. |
| `malformed/main.tf` | An unterminated string on `engine_version` (line 3) makes the file invalid. No partial declaration, no error. |

The zero and malformed folders each hold one file per declaration type, so the same rules apply to compose and Terraform. Secrets and passwords are not part of these fixtures.
