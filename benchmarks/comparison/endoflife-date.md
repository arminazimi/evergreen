# Evergreen measured against endoflife.date

<!-- Result record. The command in README.md rewrites this page; endoflife-date.json is the data. -->

This page applies the protocol in [the comparison method](../docs/COMPARISON_METHOD.md) to the endoflife.date product data. It compares product coverage and the lifecycle dates both sides publish, using the pinned corpus as the sample. Results are published as they are, including where Evergreen loses.

* Snapshot: 2026-11-06, 44 products with 835 release cycles.
* Evergreen: 752 registry rules across 415 product families.
* Ground truth: 1512 repositories, 9774 expected findings, 235 distinct rules.

## Product coverage

| Measure | Value |
| --- | ---: |
| endoflife.date products in the snapshot | 489 |
| Evergreen registry rules | 752 |
| Evergreen product families (distinct purls) | 415 |
| Families mapped to an endoflife.date product | 103 |
| endoflife.date products with at least one Evergreen rule | 42 |
| endoflife.date products with no Evergreen rule | 447 |

The coverage gap runs both ways: endoflife.date is broader across products, while Evergreen covers families endoflife.date does not model. The families below are not a win or a loss; they are outside the comparison because the other side publishes no release cycle for them.

| Reason | Families | Rules | Examples |
| --- | ---: | ---: | --- |
| `package-level` | 142 | 175 | pkg:cargo/ansi_term, pkg:cargo/atty, pkg:cargo/failure, pkg:cargo/tempdir, pkg:composer/doctrine/cache |
| `managed-runtime` | 75 | 86 | pkg:generic/azure-app-service/dotnet, pkg:generic/azure-app-service/dotnet-isolated, pkg:generic/azure-app-service/java, pkg:generic/azure-app-service/node, pkg:generic/azure-app-service/php |
| `api-retirement` | 44 | 52 | pkg:generic/helm-repository/incubator, pkg:generic/helm-repository/stable, pkg:generic/kubernetes/admissionregistration.k8s.io/MutatingWebhookConfiguration, pkg:generic/kubernetes/admissionregistration.k8s.io/ValidatingWebhookConfiguration, pkg:generic/kubernetes/apiextensions.k8s.io/CustomResourceDefinition |
| `github-actions` | 29 | 29 | pkg:generic/github-actions/add-path, pkg:generic/github-actions/save-state, pkg:generic/github-actions/set-env, pkg:generic/github-actions/set-output, pkg:github/actions/cache |
| `different-support-model` | 4 | 23 | pkg:generic/azure-aks, pkg:generic/azure-kubernetes-service, pkg:generic/google-gke, pkg:generic/google-kubernetes-engine |
| `no-product` | 5 | 23 | pkg:generic/dart, pkg:generic/google-cloud-sql-mysql, pkg:generic/google-cloud-sql-postgresql, pkg:generic/java, pkg:generic/sbt |
| `store-policy` | 2 | 6 | pkg:generic/android/targetSdk, pkg:maven/com.android.billingclient/billing |
| `ci-image-retirement` | 3 | 5 | pkg:generic/azure-pipelines/macos-image, pkg:generic/azure-pipelines/ubuntu-image, pkg:generic/azure-pipelines/windows-image |
| `toolchain-policy` | 4 | 5 | pkg:generic/cmake, pkg:generic/cmake-generator/visual-studio-12-2013, pkg:generic/cmake-module/cmake-find-frameworks, pkg:generic/cmake-module/find-gdal |
| `app-store-policy` | 2 | 3 | pkg:generic/ios, pkg:generic/xcode |
| `different-cycle-model` | 1 | 2 | pkg:generic/aws-aurora/mysql |
| `dockerfile-format` | 1 | 2 | pkg:generic/dockerfile |

### Coverage and agreement by product

| Product | Evergreen rules | Evergreen families | endoflife.date cycles | Measured | Agree | Disagree |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| alpine-linux | 3 | 2 | 32 | 3 | 3 | 0 |
| amazon-aurora-postgresql | 4 | 1 | 8 | 4 | 4 | 0 |
| amazon-eks | 11 | 1 | 20 | 9 | 9 | 0 |
| amazon-elasticache-redis | 3 | 1 | 4 | 3 | 3 | 0 |
| amazon-linux | 1 | 1 | 17 | 1 | 1 | 0 |
| amazon-rds-mysql | 2 | 1 | 18 | 2 | 2 | 0 |
| amazon-rds-postgresql | 6 | 1 | 10 | 5 | 5 | 0 |
| apache-couchdb | 1 | 1 | 4 | 0 | 0 | 0 |
| aws-lambda | 52 | 52 | 52 | 52 | 52 | 0 |
| azure-database-for-mysql | 1 | 1 | 3 | 1 | 1 | 0 |
| azure-database-for-postgresql | 1 | 1 | 8 | 1 | 1 | 0 |
| bun | 2 | 1 | 1 | 0 | 0 | 0 |
| caddy | 1 | 1 | 2 | 1 | 1 | 0 |
| centos | 1 | 1 | 4 | 1 | 1 | 0 |
| clickhouse | 1 | 1 | 22 | 0 | 0 | 0 |
| couchbase-server | 1 | 1 | 22 | 1 | 1 | 0 |
| debian | 2 | 2 | 18 | 2 | 2 | 0 |
| deno | 2 | 1 | 11 | 1 | 1 | 0 |
| dotnet | 12 | 1 | 13 | 12 | 12 | 0 |
| drupal | 1 | 1 | 21 | 1 | 1 | 0 |
| elixir | 2 | 1 | 17 | 2 | 2 | 0 |
| erlang | 2 | 1 | 13 | 2 | 0 | 2 |
| go | 7 | 2 | 18 | 7 | 7 | 0 |
| kubernetes | 9 | 1 | 22 | 8 | 8 | 0 |
| mariadb | 1 | 1 | 30 | 1 | 1 | 0 |
| mysql | 3 | 2 | 23 | 3 | 2 | 1 |
| nodejs | 82 | 2 | 26 | 8 | 8 | 0 |
| php | 7 | 1 | 23 | 7 | 7 | 0 |
| phpmyadmin | 1 | 1 | 13 | 0 | 0 | 0 |
| postgresql | 7 | 2 | 32 | 6 | 6 | 0 |
| powershell | 5 | 1 | 10 | 5 | 5 | 0 |
| python | 72 | 2 | 18 | 4 | 4 | 0 |
| redis | 3 | 2 | 12 | 3 | 3 | 0 |
| rhel | 1 | 1 | 7 | 1 | 1 | 0 |
| ruby | 14 | 2 | 15 | 14 | 10 | 4 |
| rust | 1 | 1 | 71 | 1 | 1 | 0 |
| scala | 2 | 1 | 15 | 0 | 0 | 0 |
| sles | 1 | 1 | 25 | 1 | 1 | 0 |
| terraform | 8 | 1 | 18 | 6 | 6 | 0 |
| traefik | 1 | 1 | 21 | 1 | 0 | 1 |
| ubuntu | 3 | 2 | 45 | 3 | 3 | 0 |
| zookeeper | 1 | 1 | 6 | 1 | 1 | 0 |

## Date agreement

A cycle is measured only when endoflife.date publishes an end date for every cycle the rule covers. A rule with no date on either side is counted in the bucket below the table, never as a miss.

| Sample | Measured | Agree | Disagree | Agreement |
| --- | ---: | ---: | ---: | ---: |
| All 752 registry rules | 184 | 176 | 8 | 95.7% |
| Ground-truth set (235 distinct rules) | 88 | 81 | 7 | 92.0% |

| Bucket | All registry rules | Ground-truth set |
| --- | ---: | ---: |
| Not a mapped product | 411 | 138 |
| Not a lifecycle event | 142 | 2 |
| No snapshot entry | 0 | 0 |
| No release cycle in range | 2 | 0 |
| No date in the Evergreen rule | 9 | 3 |
| No end date in endoflife.date | 4 | 4 |

## Where the data differs

A disagreement is a date difference, not a verdict. Both sides' sources are linked; the corpus note decides correctness only where it names an independently checked date (next section).

| Rule | Product / cycles | Evergreen | endoflife.date | Δ days | In ground truth |
| --- | --- | --- | --- | ---: | --- |
| container.mysql.eol-8.0-and-older | mysql / 3.23, 4.0, 4.1, 5.0, 5.1, 5.5, 5.6, 5.7, 8.0 | 2026-04-21 | 2026-04-30 | -9 | yes |
| container.ruby.eol-3.2-and-older | ruby / 1.9.3, 2.0.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.0, 3.1, 3.2 | 2026-04-01 | 2026-03-31 | 1 | yes |
| container.traefik.eol-3.6-and-older | traefik / 1.7, 2.0, 2.1, 2.10, 2.11, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | 2026-08-16 | 2026-09-07 | -22 | no |
| elixir.erlang.eol-25 | erlang / 25 | 2025-05-21 | 2025-05-17 | 4 | yes |
| elixir.erlang.eol-26 | erlang / 26 | 2026-05-13 | 2026-05-26 | -13 | yes |
| ruby.runtime.eol-2.5 | ruby / 2.5 | 2021-04-05 | 2021-03-31 | 5 | yes |
| ruby.runtime.eol-2.6 | ruby / 2.6 | 2022-04-12 | 2022-03-31 | 12 | yes |
| ruby.runtime.eol-3.2 | ruby / 3.2 | 2026-04-01 | 2026-03-31 | 1 | yes |

### container.mysql.eol-8.0-and-older

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/container.mysql.eol-8.0-and-older.md) · [endoflife.date](https://endoflife.date/mysql)
- [nestjsx/crud docker-compose.yml:21](https://github.com/nestjsx/crud/blob/d6d3c4ebd844d543ab71b494d424660c448a9d42/docker-compose.yml#L21)
- [weltraumpirat/hexagonal_ddd docker/docker-compose.yml:4](https://github.com/weltraumpirat/hexagonal_ddd/blob/a1bbdc5da7406f047269d270969ed9750bb92fa8/docker/docker-compose.yml#L4)
- [axe-api/axe-api packages/integrations/composes/docker-compose.mysql57.yml:5](https://github.com/axe-api/axe-api/blob/81deacdf696dfe3fc022cb9ce85c0bf0013c2f8a/packages/integrations/composes/docker-compose.mysql57.yml#L5)

### container.ruby.eol-3.2-and-older

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/container.ruby.eol-3.2-and-older.md) · [endoflife.date](https://endoflife.date/ruby)
- [HariSekhon/Dockerfiles fakes3/Dockerfile:15](https://github.com/HariSekhon/Dockerfiles/blob/b38ac95de8be22e481385ae220ea2949fe24ba51/fakes3/Dockerfile#L15)
- [chrishenry/deltanyc-heatseek angular-rails-app/Dockerfile:1](https://github.com/chrishenry/deltanyc-heatseek/blob/258e225efa89e46e92e9676864f8c07976b4ccf2/angular-rails-app/Dockerfile#L1)
- [mislav/hub Dockerfile:1](https://github.com/mislav/hub/blob/5c547ed804368763064e51f3990851e267e88edd/Dockerfile#L1)

### container.traefik.eol-3.6-and-older

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/container.traefik.eol-3.6-and-older.md) · [endoflife.date](https://endoflife.date/traefik)
- No pinned corpus repository exercises this rule; it is outside the ground-truth sample.

### elixir.erlang.eol-25

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/elixir.erlang.eol-25.md) · [endoflife.date](https://endoflife.date/erlang)
- [smpallen99/coherence .tool-versions:2](https://github.com/smpallen99/coherence/blob/ede75598de6b01ce896d6ec67f0aeac6047ddbd9/.tool-versions#L2)
- [emqx/MQTT-Client-Examples mqtt-client-Elixir/.tool-versions:1](https://github.com/emqx/MQTT-Client-Examples/blob/b9378547037bdb851f6e5648976573398546dcb5/mqtt-client-Elixir/.tool-versions#L1)
- [emqx/MQTT-Client-Examples mqtt-client-Elixir/.tool-versions:2](https://github.com/emqx/MQTT-Client-Examples/blob/b9378547037bdb851f6e5648976573398546dcb5/mqtt-client-Elixir/.tool-versions#L2)

### elixir.erlang.eol-26

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/elixir.erlang.eol-26.md) · [endoflife.date](https://endoflife.date/erlang)
- [sasa1977/elixir-in-action .tool-versions:1](https://github.com/sasa1977/elixir-in-action/blob/4e9067ab5a98959bf5198b2b340a89af429e15c5/.tool-versions#L1)
- [sasa1977/elixir-in-action .tool-versions:2](https://github.com/sasa1977/elixir-in-action/blob/4e9067ab5a98959bf5198b2b340a89af429e15c5/.tool-versions#L2)
- [sasa1977/boundary .tool-versions:1](https://github.com/sasa1977/boundary/blob/f53ad7d88068a8019842974191c5c5039a0902f6/.tool-versions#L1)

### ruby.runtime.eol-2.5

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/ruby.runtime.eol-2.5.md) · [endoflife.date](https://endoflife.date/ruby)
- [ryanto/acts_as_votable .ruby-version:1](https://github.com/ryanto/acts_as_votable/blob/5ac261bac166bce37d046527f9b26425da4dc5b2/.ruby-version#L1)
- [RailsApps/rails_apps_composer .ruby-version:1](https://github.com/RailsApps/rails_apps_composer/blob/b4165ab87cebe5985bc7fa44bf4240fd1ad680f8/.ruby-version#L1)
- [hyperstack-org/hyperstack ruby/examples/tutorials/todos/.ruby-version:1](https://github.com/hyperstack-org/hyperstack/blob/52a06b26d3ab81520bd9c5667367e880dbe90e99/ruby/examples/tutorials/todos/.ruby-version#L1)

### ruby.runtime.eol-2.6

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/ruby.runtime.eol-2.6.md) · [endoflife.date](https://endoflife.date/ruby)
- [alabsi91/reanimated-color-picker ExampleLatest/Gemfile.lock:114](https://github.com/alabsi91/reanimated-color-picker/blob/bae423b0319422bc357f1f11f8188c1b8130b28c/ExampleLatest/Gemfile.lock#L114)
- [alabsi91/reanimated-color-picker ExampleOldArch/Gemfile.lock:117](https://github.com/alabsi91/reanimated-color-picker/blob/bae423b0319422bc357f1f11f8188c1b8130b28c/ExampleOldArch/Gemfile.lock#L117)
- [HomeBusProjects/HomeBus deploy/.ruby-version:1](https://github.com/HomeBusProjects/HomeBus/blob/15681fbaf24f3c54b16c9526cdde983a34f96d21/deploy/.ruby-version#L1)

### ruby.runtime.eol-3.2

- [Evergreen rule](https://github.com/arminazimi/evergreen/blob/main/docs/rules/ruby.runtime.eol-3.2.md) · [endoflife.date](https://endoflife.date/ruby)
- [imaNNeo/fl_chart example/.ruby-version:1](https://github.com/imaNNeo/fl_chart/blob/ecada9478275e987dbac53c2d16b4fb3f2bcb78e/example/.ruby-version#L1)
- [azirbel/npoint .ruby-version:1](https://github.com/azirbel/npoint/blob/f6c8c20f213a6f3e210ee935427e010d9d642cad/.ruby-version#L1)
- [azirbel/npoint Gemfile:3](https://github.com/azirbel/npoint/blob/f6c8c20f213a6f3e210ee935427e010d9d642cad/Gemfile#L3)

## Vendor-checked correctness

11 ground-truth rules carry an independently vendor-checked lifecycle date in the corpus note. Each tool's date is compared with that date, not with the other tool.

| Measure | Evergreen | endoflife.date |
| --- | ---: | ---: |
| Matches the vendor-checked date | 11 / 11 | 11 / 11 |

| Rule | Product | Vendor-checked date | Evergreen date | endoflife.date | Evergreen matches | endoflife.date matches |
| --- | --- | --- | --- | --- | --- | --- |
| database.postgresql.end-of-life-13 | postgresql | 2025-11-13 | 2025-11-13 | 2025-11-13 | yes | yes |
| dotnet.runtime.end-of-support-3.1 | dotnet | 2022-12-13 | 2022-12-13 | 2022-12-13 | yes | yes |
| go.runtime.end-of-support-1.25 | go | 2026-08-19 | 2026-08-19 | 2026-08-19 | yes | yes |
| nodejs.runtime.eol-18 | nodejs | 2025-04-30 | 2025-04-30 | 2025-04-30 | yes | yes |
| php.runtime.eol-7.4 | php | 2022-11-28 | 2022-11-28 | 2022-11-28 | yes | yes |
| python.runtime.eol-3.10-and-older | python | 2026-10-01 | 2026-10-01 | 2026-10-01 | yes | yes |
| python.runtime.eol-3.9-and-older | python | 2025-10-31 | 2025-10-31 | 2025-10-31 | yes | yes |
| ruby.runtime.eol-3.0 | ruby | 2024-04-23 | 2024-04-23 | 2024-04-23 | yes | yes |
| serverless.aws-lambda.python3.8 | aws-lambda | 2024-10-14 | 2024-10-14 | 2024-10-14 | yes | yes |
| shell.powershell.end-of-life-7.1 | powershell | 2022-05-08 | 2022-05-08 | 2022-05-08 | yes | yes |
| terraform.cli.end-of-support-1.13 | terraform | 2026-04-29 | 2026-04-29 | 2026-04-29 | yes | yes |

## Reproduce

One command rebuilds every comparison table and checks it against the committed known result:

```bash
npm ci
npm run comparison:reproduce
```

This page alone can be rebuilt and checked with:

```bash
node dist/benchmarks/comparison/compare-endoflife-date.js          # rewrite this page and endoflife-date.json
node dist/benchmarks/comparison/compare-endoflife-date.js --check  # exit 1 when either file is stale
```

The snapshot was retrieved on 2026-11-06 from https://endoflife.date/api/all.json and the per-product endpoints, which are MIT-licensed; refreshing it is a maintainer action with network access. The comparison itself reads only committed files.
