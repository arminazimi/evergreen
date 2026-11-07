# Evergreen compared with Dependabot

Run under [docs/COMPARISON_METHOD.md](../../../docs/COMPARISON_METHOD.md), whose section 7 records that Dependabot
cannot be run against a pinned commit. This is therefore **not a head-to-head result**: Dependabot was not run, and
no finding here was reported by it. What is measured is the update surface each repository's committed
`dependabot.yml` declares, checked against the same pinned checkouts. Read [README.md](README.md) for what the
numbers do and do not say.

Evergreen 0.7.3 at 7cdd0e5f (the base commit the run executed from).

## Summary

| Selection | Repositories | With a config | Without a config | Evergreen findings | Covered | Uncovered | Uncovered, no config | Uncovered, config present | Filtered | No entry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Blind | 991 | 116 | 875 | 6429 | 265 | 3500 | 3187 | 313 | 32 | 2632 |
| Targeted | 5 | 3 | 2 | 165 | 0 | 113 | 52 | 61 | 16 | 36 |

- **Covered:** a matching `package-ecosystem` and directory is declared, with no `ignore` or `allow` list. The
  package and directory are inside the update surface the repository asked Dependabot to watch. This does not mean
  Dependabot reported the lifecycle fact; it only means it can see that dependency.
- **Uncovered:** the bridge maps the finding to a Dependabot `package-ecosystem`, but no declared entry watches that
  ecosystem and directory. It is split by whether the repository commits a Dependabot configuration at all.
- **Filtered:** a matching entry declares `ignore` or `allow`. Those dependency-level filters are not evaluated, so
  the finding is counted neither as covered nor as uncovered.
- **No entry:** the bridge has no `package-ecosystem` for the finding, so no update entry could carry it. The
  mapping is Evergreen's bridge, not Dependabot's ecosystem list; a missing mapping is a limit of the bridge.

## By Dependabot package-ecosystem

Findings the bridge maps to a Dependabot `package-ecosystem`, grouped by that ecosystem. Runtime findings, retired
APIs, host-image policies, and Dockerfile syntax are not in this table at all; they have no update entry.

| Selection | package-ecosystem | Covered | Uncovered | Filtered | Total |
| --- | --- | ---: | ---: | ---: | ---: |
| Blind | cargo | 0 | 26 | 0 | 26 |
| Blind | composer | 0 | 32 | 0 | 32 |
| Blind | docker | 2 | 196 | 0 | 198 |
| Blind | github-actions | 251 | 2268 | 22 | 2541 |
| Blind | gomod | 1 | 2 | 0 | 3 |
| Blind | gradle | 0 | 18 | 0 | 18 |
| Blind | maven | 1 | 63 | 0 | 64 |
| Blind | npm | 10 | 886 | 10 | 906 |
| Blind | nuget | 0 | 1 | 0 | 1 |
| Blind | pip | 0 | 8 | 0 | 8 |
| Targeted | docker | 0 | 15 | 0 | 15 |
| Targeted | github-actions | 0 | 77 | 0 | 77 |
| Targeted | npm | 0 | 21 | 16 | 37 |

## Findings with no Dependabot update entry

Grouped by the first two rule-id segments. They are not misses of Dependabot and not wins for Evergreen: the bridge
has no update entry to put them in.

| Selection | Rule family | Findings |
| --- | --- | ---: |
| Blind | `dotnet.runtime` | 528 |
| Blind | `terraform.syntax` | 375 |
| Blind | `container.dockerfile` | 309 |
| Blind | `nodejs.runtime` | 236 |
| Blind | `python.runtime` | 188 |
| Blind | `serverless.aws-lambda` | 150 |
| Blind | `dart.sdk` | 95 |
| Blind | `go.runtime` | 94 |
| Blind | `shell.powershell` | 93 |
| Blind | `ruby.runtime` | 78 |
| Blind | `terraform.function` | 73 |
| Blind | `elixir.erlang` | 49 |
| Blind | `github-actions.workflow-command` | 47 |
| Blind | `scala.sbt` | 47 |
| Blind | `swift.xcode` | 47 |
| Blind | `kubernetes.extensions` | 39 |
| Blind | `scala.runtime` | 30 |
| Blind | `cpp.cmake` | 28 |
| Blind | `elixir.runtime` | 24 |
| Blind | `ci-images.azure-pipelines` | 19 |
| Blind | `swift.app-store` | 17 |
| Blind | `php.runtime` | 12 |
| Blind | `rust.toolchain` | 12 |
| Blind | `kubernetes.apps` | 11 |
| Blind | `database.postgresql` | 7 |
| Blind | `database.mysql` | 6 |
| Blind | `kubernetes.batch` | 4 |
| Blind | `database.redis` | 2 |
| Blind | `kubernetes.apiextensions-k8s-io` | 2 |
| Blind | `kubernetes.autoscaling` | 2 |
| Blind | `kubernetes.storage-k8s-io` | 2 |
| Blind | `deno.bun` | 1 |
| Blind | `deno.runtime` | 1 |
| Blind | `java.jdk` | 1 |
| Blind | `kubernetes.networking-k8s-io` | 1 |
| Blind | `kubernetes.policy` | 1 |
| Blind | `kubernetes.rbac-authorization-k8s-io` | 1 |
| Targeted | `nodejs.runtime` | 24 |
| Targeted | `container.dockerfile` | 7 |
| Targeted | `github-actions.workflow-command` | 2 |
| Targeted | `python.runtime` | 2 |
| Targeted | `database.postgresql` | 1 |

## Repositories with a Dependabot config

Every repository in the comparison that commits a Dependabot configuration, with its pinned file linked. Rows with
no findings are still listed, because the configuration is part of the evidence.

| Repository | Selection | Config | Entries | Findings | Covered | Uncovered | Filtered | No entry |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| aarongarrett/inspyred | Blind | [`.github/dependabot.yml`](https://github.com/aarongarrett/inspyred/blob/fb29ba3b9d9e582dabe72f278458ed0e6932eb7c/.github/dependabot.yml) | 1 | 3 | 0 | 0 | 0 | 3 |
| acolomba/blackvuesync | Blind | [`.github/dependabot.yml`](https://github.com/acolomba/blackvuesync/blob/e2c382fa40392f5d4d1a156b29427d032911d736/.github/dependabot.yml) | 3 | 2 | 0 | 1 | 0 | 1 |
| adamyodinsky/TerminalGPT | Blind | [`.github/dependabot.yml`](https://github.com/adamyodinsky/TerminalGPT/blob/48739c452f5e16e8953a8c98deed47adcabcf736/.github/dependabot.yml) | 1 | 6 | 0 | 4 | 0 | 2 |
| ain-soph/trojanzoo | Blind | [`.github/dependabot.yml`](https://github.com/ain-soph/trojanzoo/blob/45d680c4d3bc7810a0a7a5b6fa939f87d5e6c551/.github/dependabot.yml) | 2 | 14 | 14 | 0 | 0 | 0 |
| aio-libs/aiosmtpd | Blind | [`.github/dependabot.yml`](https://github.com/aio-libs/aiosmtpd/blob/0aef6a19bf3c43ebded54ee943aaacbff93d68bf/.github/dependabot.yml) | 2 | 1 | 0 | 0 | 0 | 1 |
| alexandregpereira/Monster-Compendium | Blind | [`.github/dependabot.yml`](https://github.com/alexandregpereira/Monster-Compendium/blob/8d7225ff3454c8e546d09bcc4791f3cdb9f8bdd3/.github/dependabot.yml) | 1 | 14 | 0 | 14 | 0 | 0 |
| allegro/node-worker-nodes | Blind | [`.github/dependabot.yml`](https://github.com/allegro/node-worker-nodes/blob/ad3c86730e8bf70bfad8d6d18a6fc5bf584c9443/.github/dependabot.yml) | 3 | 15 | 7 | 0 | 0 | 8 |
| ardalis/GuardClauses | Blind | [`.github/dependabot.yml`](https://github.com/ardalis/GuardClauses/blob/61dde6c9d3e1715286bd100144a9edff1ad0664c/.github/dependabot.yml) | 2 | 3 | 0 | 0 | 0 | 3 |
| ardalis/SmartEnum | Blind | [`.github/dependabot.yml`](https://github.com/ardalis/SmartEnum/blob/e06da550950b347f0ee47b1ec370a7416e79b030/.github/dependabot.yml) | 1 | 68 | 0 | 26 | 0 | 42 |
| asciimoo/hister | Blind | [`.github/dependabot.yml`](https://github.com/asciimoo/hister/blob/5f04dd9352cdeefdc9602f0dba14045aad710a11/.github/dependabot.yml) | 5 | 0 | 0 | 0 | 0 | 0 |
| Automattic/simplenote-electron | Blind | [`.github/dependabot.yml`](https://github.com/Automattic/simplenote-electron/blob/a5a1a86f1ada16f97f14533491d1a85313c68edb/.github/dependabot.yml) | 1 | 11 | 0 | 6 | 0 | 5 |
| aws-cloudformation/cloudformation-cli | Blind | [`.github/dependabot.yml`](https://github.com/aws-cloudformation/cloudformation-cli/blob/232d2983fcba15ff8f7da026c116efa51f5ae486/.github/dependabot.yml) | 1 | 7 | 6 | 0 | 0 | 1 |
| aws-cloudformation/cloudformation-guard | Blind | [`.github/dependabot.yml`](https://github.com/aws-cloudformation/cloudformation-guard/blob/d7cbdb08ea91a60739684c6c453176341f6e32aa/.github/dependabot.yml) | 3 | 38 | 0 | 32 | 0 | 6 |
| awslabs/aws-config-rdklib | Blind | [`.github/dependabot.yml`](https://github.com/awslabs/aws-config-rdklib/blob/dd90eb67422b4c2d91a4dd79ec3e970d6f051b2a/.github/dependabot.yml) | 1 | 10 | 0 | 9 | 0 | 1 |
| Azure/azure-functions-powershell-worker | Blind | [`.github/dependabot.yml`](https://github.com/Azure/azure-functions-powershell-worker/blob/2debea0f983f5016d3c54302c749e8f7e4690544/.github/dependabot.yml) | 1 | 5 | 1 | 1 | 0 | 3 |
| BranchMetrics/android-branch-deep-linking-attribution | Blind | [`.github/dependabot.yml`](https://github.com/BranchMetrics/android-branch-deep-linking-attribution/blob/e12e2998cf1b4e3d87c613c49cd4ae78a003bf0a/.github/dependabot.yml) | 1 | 9 | 5 | 4 | 0 | 0 |
| bxcodec/go-clean-arch | Blind | [`.github/dependabot.yml`](https://github.com/bxcodec/go-clean-arch/blob/e06c6d0cb37069b0ef56e3df67f80ca130a1ab82/.github/dependabot.yml) | 1 | 4 | 0 | 3 | 0 | 1 |
| cfug/dio | Blind | [`.github/dependabot.yaml`](https://github.com/cfug/dio/blob/f1bef462289b40992d625d4eb2a2f42321217573/.github/dependabot.yaml) | 1 | 0 | 0 | 0 | 0 | 0 |
| charmbracelet/wish | Blind | [`.github/dependabot.yml`](https://github.com/charmbracelet/wish/blob/2af05484795152f53d9ad10b5be5748a4bec3c95/.github/dependabot.yml) | 4 | 0 | 0 | 0 | 0 | 0 |
| cobrateam/splinter | Blind | [`.github/dependabot.yml`](https://github.com/cobrateam/splinter/blob/861539107381e848f63c350189360520c300ced9/.github/dependabot.yml) | 1 | 16 | 0 | 15 | 0 | 1 |
| coingaming/moon | Blind | [`.github/dependabot.yml`](https://github.com/coingaming/moon/blob/7b2881ef1a4b8e0d0d297f92df7085e6461e4d77/.github/dependabot.yml) | 1 | 19 | 6 | 10 | 0 | 3 |
| DarrenOfficial/dpaste | Blind | [`.github/dependabot.yml`](https://github.com/DarrenOfficial/dpaste/blob/64068f7a78158a09babd5880f1384610ffc710c8/.github/dependabot.yml) | 1 | 16 | 0 | 5 | 0 | 11 |
| dart-lang/sdk | Blind | [`.github/dependabot.yml`](https://github.com/dart-lang/sdk/blob/f017eb8d9c74c497aea4577ea700abbe975aba2a/.github/dependabot.yml) | 1 | 3 | 0 | 0 | 0 | 3 |
| django-haystack/celery-haystack | Blind | [`.github/dependabot.yml`](https://github.com/django-haystack/celery-haystack/blob/def20823844bde2a0b8bc8c16e8d4930346b7a1e/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| dmyersturnbull/tyrannosaurus | Blind | [`.github/dependabot.yml`](https://github.com/dmyersturnbull/tyrannosaurus/blob/d7df1cae6ffd470d524b4c9f7fd9963ba7c54d99/.github/dependabot.yml) | 5 | 17 | 15 | 1 | 0 | 1 |
| dodobrands/DBThreadSafe-ios | Blind | [`.github/dependabot.yml`](https://github.com/dodobrands/DBThreadSafe-ios/blob/0b822c3ed3c398d045bf44b52897b40c670e5858/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| dodobrands/Peekie | Blind | [`.github/dependabot.yml`](https://github.com/dodobrands/Peekie/blob/0369e354538a2e4230ea9a4562cb1087ab9725b1/.github/dependabot.yml) | 2 | 0 | 0 | 0 | 0 | 0 |
| doitintl/kube-no-trouble | Blind | [`.github/dependabot.yml`](https://github.com/doitintl/kube-no-trouble/blob/2366d92156c0cf94c31453593368077f13c183b7/.github/dependabot.yml) | 2 | 21 | 1 | 19 | 0 | 1 |
| domaindrivendev/Swashbuckle.AspNetCore | Blind | [`.github/dependabot.yml`](https://github.com/domaindrivendev/Swashbuckle.AspNetCore/blob/819734d42ad5bd0305b04f36aee7ec7cea01b7f1/.github/dependabot.yml) | 4 | 2 | 0 | 0 | 0 | 2 |
| dotnet/vscode-csharp | Blind | [`.github/dependabot.yml`](https://github.com/dotnet/vscode-csharp/blob/1833384d44a9b850bde1d13570a7a96d70df5d1a/.github/dependabot.yml) | 1 | 20 | 0 | 11 | 0 | 9 |
| dpgaspar/Flask-AppBuilder | Blind | [`.github/dependabot.yml`](https://github.com/dpgaspar/Flask-AppBuilder/blob/30e13dc7916167fa159452322aa00d03999970f9/.github/dependabot.yml) | 3 | 14 | 11 | 1 | 0 | 2 |
| dreamfactorysoftware/dreamfactory | Blind | [`.github/dependabot.yml`](https://github.com/dreamfactorysoftware/dreamfactory/blob/2965df25098ee1b580e2756807fa65c66dc8eb28/.github/dependabot.yml) | 1 | 19 | 0 | 19 | 0 | 0 |
| driesvints/blade-icons | Blind | [`.github/dependabot.yml`](https://github.com/driesvints/blade-icons/blob/7c464ea7b5ac12a4957871f3596e8cee09375aad/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| ecugol/pre-commit-hooks-django | Blind | [`.github/dependabot.yml`](https://github.com/ecugol/pre-commit-hooks-django/blob/7f436e6be071cfa69ba9f10091184d5c9cc94dcd/.github/dependabot.yml) | 1 | 5 | 4 | 0 | 0 | 1 |
| ente/ente | Blind | [`.github/dependabot.yml`](https://github.com/ente/ente/blob/3ffa9616868b80ac05ca377dcfffc007d645962c/.github/dependabot.yml) | 9 | 0 | 0 | 0 | 0 | 0 |
| felangel/bloc | Blind | [`.github/dependabot.yml`](https://github.com/felangel/bloc/blob/b9be1e252ee24ffbe9f2fb629edc7624b2cfbf05/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| Ff00ff/mammoth | Blind | [`.github/dependabot.yml`](https://github.com/Ff00ff/mammoth/blob/8122afe43425c135a1dd8f0cd22606fb0e0a994d/.github/dependabot.yml) | 1 | 30 | 0 | 16 | 9 | 5 |
| firebase/flutterfire | Blind | [`.github/dependabot.yml`](https://github.com/firebase/flutterfire/blob/d07113e3adfe128d2e4810bae22c5ca5bcbc48eb/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| flutter/samples | Blind | [`.github/dependabot.yaml`](https://github.com/flutter/samples/blob/9df2cac15cc3d28a51aace018ad822387d30ac72/.github/dependabot.yaml) | 25 | 3 | 0 | 0 | 0 | 3 |
| Foxlider/FASTER | Blind | [`.github/dependabot.yml`](https://github.com/Foxlider/FASTER/blob/ca7c9b51ec5c28c57bc926d9e025daca39cffcc6/.github/dependabot.yml) | 3 | 5 | 0 | 0 | 0 | 5 |
| gethomepage/homepage | Targeted | [`.github/dependabot.yml`](https://github.com/gethomepage/homepage/blob/89b0d20655ca521e55ae65097c2da4285c87a403/.github/dependabot.yml) | 2 | 2 | 0 | 2 | 0 | 0 |
| globus/django-globus-portal-framework | Blind | [`.github/dependabot.yaml`](https://github.com/globus/django-globus-portal-framework/blob/53eae48c609cd29c70ef9839762b3030f1895297/.github/dependabot.yaml) | 1 | 0 | 0 | 0 | 0 | 0 |
| hellofresh/action-changed-files | Blind | [`.github/dependabot.yml`](https://github.com/hellofresh/action-changed-files/blob/6e0e3a3fa45bb877dbcefee16c4d8a1f676fcee8/.github/dependabot.yml) | 2 | 0 | 0 | 0 | 0 | 0 |
| heroesofcode/swift-explorer | Blind | [`.github/dependabot.yml`](https://github.com/heroesofcode/swift-explorer/blob/67f106314b5e9b4de5c05821d03432139991448e/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| heroku/python-getting-started | Blind | [`.github/dependabot.yml`](https://github.com/heroku/python-getting-started/blob/561bc55e4aaf22f98c040611fd613994547b31bb/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| hiddify/hiddify-app | Blind | [`.github/dependabot.yml`](https://github.com/hiddify/hiddify-app/blob/0d6eb8826635babf392f34572727a3f9f6ef6316/.github/dependabot.yml) | 1 | 6 | 0 | 4 | 0 | 2 |
| hisaac/workbench | Blind | [`.github/dependabot.yml`](https://github.com/hisaac/workbench/blob/b9bbc706e7453bd46035b41e3f975d3d790e7957/.github/dependabot.yml) | 2 | 1 | 0 | 0 | 0 | 1 |
| huggingface/hf_transfer | Blind | [`.github/dependabot.yml`](https://github.com/huggingface/hf_transfer/blob/dd35eb2e0ee11c8d0ee266634eb450038e6f97b4/.github/dependabot.yml) | 1 | 15 | 14 | 0 | 0 | 1 |
| imaNNeo/fl_chart | Blind | [`.github/dependabot.yml`](https://github.com/imaNNeo/fl_chart/blob/ecada9478275e987dbac53c2d16b4fb3f2bcb78e/.github/dependabot.yml) | 2 | 18 | 16 | 0 | 0 | 2 |
| Jackett/Jackett | Blind | [`.github/dependabot.yml`](https://github.com/Jackett/Jackett/blob/9ce4f3973e6232199465e0230b018103db4bca03/.github/dependabot.yml) | 1 | 9 | 0 | 0 | 0 | 9 |
| jcgay/maven-color | Blind | [`.github/dependabot.yml`](https://github.com/jcgay/maven-color/blob/867eb67b296aaf336049e6eada92d49bfd50e9de/.github/dependabot.yml) | 1 | 3 | 0 | 3 | 0 | 0 |
| jugglerchris/rust-html2text | Blind | [`.github/dependabot.yml`](https://github.com/jugglerchris/rust-html2text/blob/3164eb0d303b63fe66848bd7842e93ac31078ae5/.github/dependabot.yml) | 1 | 4 | 0 | 4 | 0 | 0 |
| kaitai-io/kaitai_struct_cpp_stl_runtime | Blind | [`.github/dependabot.yml`](https://github.com/kaitai-io/kaitai_struct_cpp_stl_runtime/blob/4ca1ba36d2e8816bae3875378c55cf2d01c3971e/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| Kimeur/duology | Blind | [`.github/dependabot.yml`](https://github.com/Kimeur/duology/blob/cffd95d90ac0c7a61578c9bfaada80f0b33e0190/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| lbdremy/solr-node-client | Blind | [`.github/dependabot.yml`](https://github.com/lbdremy/solr-node-client/blob/c1a2f2a3ec233a19f84b061eb01ff4ae718d14ef/.github/dependabot.yml) | 2 | 16 | 7 | 0 | 0 | 9 |
| localsend/localsend | Blind | [`.github/dependabot.yml`](https://github.com/localsend/localsend/blob/92e133aa43869e94d394fd04fa70c50a0f796a64/.github/dependabot.yml) | 1 | 16 | 14 | 0 | 0 | 2 |
| lollipopkit/flutter_server_box | Blind | [`.github/dependabot.yml`](https://github.com/lollipopkit/flutter_server_box/blob/3e2db60c8645d61519762feff87a114eccaae8a8/.github/dependabot.yml) | 8 | 1 | 0 | 0 | 0 | 1 |
| LSPosed/LSPosed | Blind | [`.github/dependabot.yml`](https://github.com/LSPosed/LSPosed/blob/df74d83eb03a44cc6ad268841ac2ada28d077c77/.github/dependabot.yml) | 1 | 15 | 0 | 11 | 0 | 4 |
| LyraVoid/FolkLite | Blind | [`.github/dependabot.yml`](https://github.com/LyraVoid/FolkLite/blob/56e092b316076c9db63312e9cd8113b3fe1544a4/.github/dependabot.yml) | 3 | 1 | 1 | 0 | 0 | 0 |
| maplibre/maplibre-compose | Blind | [`.github/dependabot.yml`](https://github.com/maplibre/maplibre-compose/blob/9662e569207c32af9e40990084af60fd9148c7ee/.github/dependabot.yml) | 3 | 0 | 0 | 0 | 0 | 0 |
| mckenziearts/laravel-notify | Blind | [`.github/dependabot.yml`](https://github.com/mckenziearts/laravel-notify/blob/f57094aae5d336046ced7a5e1fd1eeb37c0219d4/.github/dependabot.yml) | 3 | 0 | 0 | 0 | 0 | 0 |
| mealie-recipes/mealie | Targeted | [`.github/dependabot.yml`](https://github.com/mealie-recipes/mealie/blob/50a341ed3febc98a5a20b61fad5e74a290394f16/.github/dependabot.yml) | 2 | 23 | 0 | 18 | 0 | 5 |
| microsoft/azure-redcap-paas | Blind | [`.github/dependabot.yml`](https://github.com/microsoft/azure-redcap-paas/blob/616a73de969f04a0a57b65e989758a568bea0ef8/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| microsoft/BCQuality | Blind | [`.github/dependabot.yml`](https://github.com/microsoft/BCQuality/blob/634aba3df9af1b4579e8a735b186e3efdbf47de2/.github/dependabot.yml) | 1 | 5 | 0 | 0 | 0 | 5 |
| microsoft/FASTER | Blind | [`.github/dependabot.yml`](https://github.com/microsoft/FASTER/blob/332ea7da532a688acf648ee60c4f63a1caeaf1f7/.github/dependabot.yml) | 1 | 46 | 0 | 0 | 0 | 46 |
| microsoft/MSBuildSdks | Blind | [`.github/dependabot.yml`](https://github.com/microsoft/MSBuildSdks/blob/eeadbd0c1d4fecbd95f5c6d4c8194726998508bc/.github/dependabot.yml) | 1 | 20 | 0 | 0 | 0 | 20 |
| microsoft/SDCM | Blind | [`.github/dependabot.yml`](https://github.com/microsoft/SDCM/blob/939279a9f75f0c752aad39ad0ef12080ee832e81/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| microsoft/SwiftStreamingMarkdown | Blind | [`.github/dependabot.yml`](https://github.com/microsoft/SwiftStreamingMarkdown/blob/95bb755a9b23a1aea8682b9ebc912cb72b176c95/.github/dependabot.yml) | 2 | 1 | 0 | 0 | 0 | 1 |
| mislav/hub | Blind | [`.github/dependabot.yml`](https://github.com/mislav/hub/blob/5c547ed804368763064e51f3990851e267e88edd/.github/dependabot.yml) | 3 | 8 | 4 | 1 | 0 | 3 |
| moditect/jfrunit | Blind | [`.github/dependabot.yml`](https://github.com/moditect/jfrunit/blob/b676511be0506a8653358060eb2fdb4fe27873a3/.github/dependabot.yml) | 2 | 14 | 13 | 0 | 0 | 1 |
| mywalkb/LSPosed_mod | Blind | [`.github/dependabot.yml`](https://github.com/mywalkb/LSPosed_mod/blob/9cd7a47d644d33e09762f669e57f722d979eddfe/.github/dependabot.yml) | 2 | 14 | 10 | 0 | 0 | 4 |
| n8henrie/pycookiecheat | Blind | [`.github/dependabot.yml`](https://github.com/n8henrie/pycookiecheat/blob/eed8f7411fd498344a7c95592893828a42d20414/.github/dependabot.yml) | 0 | 8 | 0 | 4 | 0 | 4 |
| navikt/security-playbook | Blind | [`.github/dependabot.yml`](https://github.com/navikt/security-playbook/blob/7b310ffa2b7b55c1993b469de0eb130e631fb576/.github/dependabot.yml) | 2 | 1 | 1 | 0 | 0 | 0 |
| navinpeiris/geoip | Blind | [`.github/dependabot.yml`](https://github.com/navinpeiris/geoip/blob/444b82a2c88566348fc563a7b1c40087961c6e93/.github/dependabot.yml) | 2 | 6 | 3 | 0 | 0 | 3 |
| neo4j-examples/movies-java-spring-data-neo4j | Blind | [`.github/dependabot.yml`](https://github.com/neo4j-examples/movies-java-spring-data-neo4j/blob/e009df722b0d085e31b4cc4e7f84b12b16fb8925/.github/dependabot.yml) | 2 | 7 | 0 | 7 | 0 | 0 |
| nextstrain/augur | Blind | [`.github/dependabot.yml`](https://github.com/nextstrain/augur/blob/49d74672ef3f07a7e87375e45c381e17dce5be83/.github/dependabot.yml) | 2 | 1 | 0 | 0 | 0 | 1 |
| NSEcho/furlzz | Blind | [`.github/dependabot.yml`](https://github.com/NSEcho/furlzz/blob/4c5cac756d08166fb48642c47f86e2cd20ddcf1b/.github/dependabot.yml) | 1 | 5 | 0 | 4 | 0 | 1 |
| nulab/scala-oauth2-provider | Blind | [`.github/dependabot.yml`](https://github.com/nulab/scala-oauth2-provider/blob/ad54cbd909c4a9cd1a651840777c41f2d503c8ff/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| ossf/package-analysis | Blind | [`.github/dependabot.yml`](https://github.com/ossf/package-analysis/blob/c5c45008da694036d701ba76fe9567fc8a5b9675/.github/dependabot.yml) | 4 | 4 | 1 | 2 | 0 | 1 |
| outline/outline | Targeted | [`.github/dependabot.yml`](https://github.com/outline/outline/blob/879c568a2ce55b0462651fa580de7f65faae026c/.github/dependabot.yml) | 1 | 67 | 0 | 41 | 16 | 10 |
| pacman82/odbc2parquet | Blind | [`.github/dependabot.yml`](https://github.com/pacman82/odbc2parquet/blob/e1b93b538ac875404d5fe7f7be9a3fb0dfb73a73/.github/dependabot.yml) | 2 | 0 | 0 | 0 | 0 | 0 |
| pallets-eco/flask-debugtoolbar | Blind | [`.github/dependabot.yml`](https://github.com/pallets-eco/flask-debugtoolbar/blob/5751c9ddac8d9571c0bcb25ff586a9eac27af022/.github/dependabot.yml) | 2 | 11 | 10 | 0 | 0 | 1 |
| paulgessinger/swift-paperless | Blind | [`.github/dependabot.yml`](https://github.com/paulgessinger/swift-paperless/blob/ceb007633eab1b33e092243b332247e72489d375/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| peek-travel/cocktail | Blind | [`.github/dependabot.yml`](https://github.com/peek-travel/cocktail/blob/80b7c9372e30d97ca6bee3f036fc0d9cf8b81ffc/.github/dependabot.yml) | 2 | 16 | 13 | 0 | 0 | 3 |
| pester/Pester | Blind | [`.github/dependabot.yml`](https://github.com/pester/Pester/blob/98e56d65da1642a7158992b50ded240c42a3ac18/.github/dependabot.yml) | 1 | 3 | 0 | 0 | 0 | 3 |
| petalframework/petal_components | Blind | [`.github/dependabot.yml`](https://github.com/petalframework/petal_components/blob/9f61e26713e886a0564f50035bf3da1d4a175366/.github/dependabot.yml) | 1 | 8 | 0 | 6 | 0 | 2 |
| PowerShell/PSReadLine | Blind | [`.github/dependabot.yml`](https://github.com/PowerShell/PSReadLine/blob/a2d143f78904f8a954f8d4b055e55ceca6939bfc/.github/dependabot.yml) | 1 | 6 | 1 | 0 | 0 | 5 |
| pyiron/pyiron | Blind | [`.github/dependabot.yml`](https://github.com/pyiron/pyiron/blob/fc126769378e33feec20da2aec2c29808f52e64c/.github/dependabot.yml) | 1 | 7 | 0 | 7 | 0 | 0 |
| railwayapp/nixpacks | Blind | [`.github/dependabot.yml`](https://github.com/railwayapp/nixpacks/blob/144b4f9ab1c3943af4dfe76d3c79d91263f5b465/.github/dependabot.yml) | 1 | 57 | 23 | 8 | 0 | 26 |
| reanimate/reanimate | Blind | [`.github/dependabot.yml`](https://github.com/reanimate/reanimate/blob/583ee9f426bb96ac15996772a6fd7ccf0caf08a7/.github/dependabot.yml) | 3 | 6 | 6 | 0 | 0 | 0 |
| replicate/cog | Blind | [`.github/dependabot.yml`](https://github.com/replicate/cog/blob/9b9f63390c08a2d1110956d50476331cdadd27e2/.github/dependabot.yml) | 5 | 7 | 0 | 0 | 5 | 2 |
| ReVanced/revanced-manager-downloaders | Blind | [`.github/dependabot.yml`](https://github.com/ReVanced/revanced-manager-downloaders/blob/41b9ab3aa39135e2f76ef76f1cd50cb3f4dd4e97/.github/dependabot.yml) | 3 | 7 | 7 | 0 | 0 | 0 |
| ReVanced/revanced-manager-downloaders-template | Blind | [`.github/dependabot.yml`](https://github.com/ReVanced/revanced-manager-downloaders-template/blob/14e7a50779268c1aad276b7bf1ec1c511f38a185/.github/dependabot.yml) | 3 | 6 | 6 | 0 | 0 | 0 |
| revelrylabs/ecto_soft_delete | Blind | [`.github/dependabot.yml`](https://github.com/revelrylabs/ecto_soft_delete/blob/03395d3f66b7844e12d1b4be5518fe868f0a868d/.github/dependabot.yml) | 1 | 3 | 0 | 2 | 0 | 1 |
| revelrylabs/text_chunker_ex | Blind | [`.github/dependabot.yml`](https://github.com/revelrylabs/text_chunker_ex/blob/e1781097d47a1dc741f441f3b89f7f12705995c0/.github/dependabot.yml) | 1 | 12 | 0 | 9 | 0 | 3 |
| rrousselGit/riverpod | Blind | [`.github/dependabot.yaml`](https://github.com/rrousselGit/riverpod/blob/7a02bedc149ef35311d856993e5bb76e528dd036/.github/dependabot.yaml) | 1 | 14 | 0 | 14 | 0 | 0 |
| sestoft/C5 | Blind | [`.github/dependabot.yml`](https://github.com/sestoft/C5/blob/224386389d83bce81a55f9da304a95d18be15aac/.github/dependabot.yml) | 2 | 9 | 4 | 0 | 0 | 5 |
| shivammathur/setup-php | Blind | [`.github/dependabot.yml`](https://github.com/shivammathur/setup-php/blob/3bdfe21000ea9539e3a94c4f692f984b24fa97e0/.github/dependabot.yml) | 1 | 1 | 0 | 0 | 0 | 1 |
| Shopify/mobile-buy-sdk-ios | Blind | [`.github/dependabot.yaml`](https://github.com/Shopify/mobile-buy-sdk-ios/blob/350c914d8beea856026807cbd3effc73aaf8b7cd/.github/dependabot.yaml) | 1 | 5 | 5 | 0 | 0 | 0 |
| simeononsecurity/AnonUpload | Blind | [`.github/dependabot.yml`](https://github.com/simeononsecurity/AnonUpload/blob/98345b632ac1cc3eb8101f197beb7f1fff8d835f/.github/dependabot.yml) | 1 | 5 | 0 | 4 | 0 | 1 |
| Simnico99/MicaWPF | Blind | [`.github/dependabot.yml`](https://github.com/Simnico99/MicaWPF/blob/13d5924d65f78fe4139033034b7759172b35d77f/.github/dependabot.yml) | 4 | 8 | 0 | 0 | 0 | 8 |
| slackapi/bolt-js | Blind | [`.github/dependabot.yml`](https://github.com/slackapi/bolt-js/blob/af7900bb6c2f3fbaa23f79aec727f2aa3ee57fd2/.github/dependabot.yml) | 12 | 9 | 0 | 0 | 1 | 8 |
| slackhq/go-audit | Blind | [`.github/dependabot.yml`](https://github.com/slackhq/go-audit/blob/4739171bc7d5dea93f863c361eec2ce30b5daa5e/.github/dependabot.yml) | 2 | 0 | 0 | 0 | 0 | 0 |
| slimkit/plus | Blind | [`.github/dependabot.yml`](https://github.com/slimkit/plus/blob/01c87057426d5656e4c667ea228f758dc89e7793/.github/dependabot.yml) | 3 | 6 | 5 | 0 | 0 | 1 |
| spatie/db-dumper | Blind | [`.github/dependabot.yml`](https://github.com/spatie/db-dumper/blob/c968c8c93d4532caa6cab82ae56df10fbbdef9c6/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| spatie/laravel-backup | Blind | [`.github/dependabot.yml`](https://github.com/spatie/laravel-backup/blob/956cec9685e0a6910b31b6df852d896e44ea0dba/.github/dependabot.yml) | 2 | 0 | 0 | 0 | 0 | 0 |
| SpectrAI-Initiative/InnoClaw | Blind | [`.github/dependabot.yml`](https://github.com/SpectrAI-Initiative/InnoClaw/blob/67231f373deac3db29f685985a5632b6c0eb0f08/.github/dependabot.yml) | 2 | 3 | 0 | 0 | 0 | 3 |
| standard-webhooks/standard-webhooks | Blind | [`.github/dependabot.yml`](https://github.com/standard-webhooks/standard-webhooks/blob/ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554/.github/dependabot.yml) | 9 | 25 | 0 | 0 | 17 | 8 |
| standard/ts-standard | Blind | [`.github/dependabot.yml`](https://github.com/standard/ts-standard/blob/5e45a1e2780f720de1328bf15bf71255881ffa7f/.github/dependabot.yml) | 2 | 9 | 2 | 0 | 0 | 7 |
| sublunarian/light-amp | Blind | [`.github/dependabot.yml`](https://github.com/sublunarian/light-amp/blob/729161a67019730aa2352d4d5aa3b01a42f640c3/.github/dependabot.yml) | 1 | 2 | 0 | 2 | 0 | 0 |
| suptejas/fleet | Blind | [`.github/dependabot.yml`](https://github.com/suptejas/fleet/blob/97c5bd2d92021b7f06cd18cb3d7f5ce38d29b4ae/.github/dependabot.yml) | 0 | 5 | 0 | 5 | 0 | 0 |
| suzaku-io/diode | Blind | [`.github/dependabot.yml`](https://github.com/suzaku-io/diode/blob/9aea00f1cf4382795e525608aecc575579ec86b5/.github/dependabot.yml) | 1 | 6 | 6 | 0 | 0 | 0 |
| timveil/leaves-of-blocks | Blind | [`.github/dependabot.yml`](https://github.com/timveil/leaves-of-blocks/blob/c410830654fa0e275aef687254e7c1a3d9377ec6/.github/dependabot.yml) | 2 | 0 | 0 | 0 | 0 | 0 |
| twitter/algebird | Blind | [`.github/dependabot.yml`](https://github.com/twitter/algebird/blob/464917d6a3f2b1c9f2048e3dd38df5dd97edc965/.github/dependabot.yml) | 1 | 12 | 12 | 0 | 0 | 0 |
| twitter/bijection | Blind | [`.github/dependabot.yml`](https://github.com/twitter/bijection/blob/35ecadc1a060167c8bff2a593c0b99b61327d65f/.github/dependabot.yml) | 1 | 1 | 1 | 0 | 0 | 0 |
| twitter/chill | Blind | [`.github/dependabot.yml`](https://github.com/twitter/chill/blob/f69dfa0edce9442a1f5c0413d8b797957b8b27d7/.github/dependabot.yml) | 1 | 11 | 10 | 0 | 0 | 1 |
| uber/AutoDispose | Blind | [`.github/dependabot.yml`](https://github.com/uber/AutoDispose/blob/b7205200096aae97db7f07afb87d27486bf684ac/.github/dependabot.yml) | 1 | 0 | 0 | 0 | 0 | 0 |
| Yubico/yubioath-flutter | Blind | [`.github/dependabot.yml`](https://github.com/Yubico/yubioath-flutter/blob/b4eca6a3888bf504cb991b1898ba8542109ded4f/.github/dependabot.yml) | 5 | 0 | 0 | 0 | 0 | 0 |
| zu1k/Good-MITM | Blind | [`.github/dependabot.yml`](https://github.com/zu1k/Good-MITM/blob/e0ad482d12a289ea5801398786ebc80fd5df1e28/.github/dependabot.yml) | 1 | 20 | 0 | 19 | 0 | 1 |


## Config files that could not be read

None.

## Totals

- **Findings:** 6594 across 996 repositories.
- **Config entries:** 256, of which 45 declare `ignore` or `allow`.
- **Configured repositories:** 119.
- **Continuity repositories:** `excalidraw/excalidraw`, `gethomepage/homepage`, `mealie-recipes/mealie`, `outline/outline`, `umami-software/umami`.
- **Dependabot:** not-run — Dependabot runs inside GitHub's service against a default branch and this repository has no runner, so no head-to-head run exists (docs/COMPARISON_METHOD.md section 7).

