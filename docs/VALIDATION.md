---
title: v0.1 validation
---

# v0.1 validation

Evergreen v0.1 was validated on 2026-10-14 against 20 public repositories pinned to immutable commits: ten Node.js repositories, nine Python repositories, and one Node.js/GitHub Actions repository. The complete corpus and expected finding locations live in `benchmarks/public-repositories.json`; the executable harness is `benchmarks/public-repositories.ts`.

## Results

| Measure | Result |
| --- | ---: |
| Repositories | 20 |
| Expected findings | 27 |
| True positives | 27 |
| False positives | 0 |
| False negatives | 0 |
| Precision | 1.0000 |
| Recall | 1.0000 |
| Median scan time | 8.19 ms |
| p95 scan time | 48.88 ms |
| Slowest scan | 49.73 ms |

Scan time measures only local Evergreen analysis after checkout. It excludes network and Git operations, which the harness reports separately as `checkoutMs` per repository and `medianCheckoutMs`, `p95CheckoutMs`, and `slowestCheckoutMs` in the summary, so Evergreen's own cost is never mixed with the time spent downloading a repository. The run used the development machine, so duration is a reference rather than a cross-machine guarantee.

## GitHub Actions corpus additions

The corpus has since grown to 30 repositories. The ten added entries are GitHub Actions repositories taken from reviewed migration commits (see [Mining migrations](../benchmarks/mining/queries.md)). Eight are pinned to the commit *before* a migration, where Evergreen must report exactly the workflow locations the migration changed, and two are pinned to the migration commit itself, where it must report nothing. Together they include reusable workflows (`Akenon-Studio/.github`) and SHA-pinned actions (`smartcrabai/paperhanger`, `openmcp-project/crossplane-headlamp-plugin`).

Every expected finding in these entries has `groundTruthSource.kind` set to `migration-commit` and links to the commit that fixed it; a test checks each link against `benchmarks/mining/review-log.json`. A SHA-pinned entry is only accepted as zero-finding after checking that no pinned reference carries a version comment below the rule's supported major, because Evergreen does not classify SHA pins yet and would otherwise hide a deprecated version. Across all 30 repositories the harness reports 48 expected findings, 48 true positives, and no false positives or false negatives (observed 2026-10-16). The table above is the original 20-repository v0.1 run.

## Method

Every expected result is identified by rule ID, repository-relative path, and line at a pinned commit. The harness downloads each commit to a temporary directory, runs all built-in detectors, compares sets in both directions, reports per-repository timing, and removes the checkout. It exits unsuccessfully for any unexpected or missing finding.

```bash
npm run validate:public-repos
```

The audit covers both positive and zero-finding repositories across npm/Node.js, Python, and GitHub Actions. Findings were checked against their repository declarations and the authoritative sources bundled with the matching lifecycle rule.

## The 50-repository corpus

The corpus now has 50 repositories: the 20 from v0.1, the ten GitHub Actions entries above, and twenty more across the shipped detectors.

- Sixteen are pinned to the parent of a reviewed migration commit: six clean ones where the migration explains every finding (node-sass removals, Python runtime floors raised to a supported release), and ten where other deprecated declarations were still present. Findings that the migration fixed cite it with `groundTruthSource.kind` `migration-commit`; the rest are `maintainer-review` and quote the exact line that was read at that commit.
- Four are zero-finding repositories, including monorepos (`withastro/astro`, `vitest-dev/vitest`, `lerna/lerna`, `changesets/changesets`). They were also searched by hand for deprecated actions, runtimes and packages, independently of Evergreen's own rules.

The review tool (`benchmarks/mining/review.ts`) now accepts npm package, Python package, and Node.js and Python runtime rules as well as GitHub Actions rules, and `mine.ts` can mine one group at a time and append without replacing reviewed candidates (`--queries npm,python --limit 10 --append`). Across all 50 repositories the harness reports 81 expected findings, 81 true positives, no false positives and no false negatives (observed 2026-10-16).

## Kubernetes corpus

Seventeen public repositories at pinned commits cover the `kubernetes` detector. Targeted (chosen knowing their result): `argoproj/argocd-example-apps` (Helm and kustomize applications, no findings), `kelseyhightower/ingress-with-static-ip`, `unixhot/salt-kubebin` (a CronJob and three Ingresses), `kubernetes/examples` (two PodSecurityPolicy documents, plus the two end-of-life base images the container detector reports there), and `lusyoe/springboot-k8s-example` (a Helm template and a plain manifest).

Blind (rule below): `kelseyhightower/kubernetes-cluster-federation` (extensions/v1beta1 Deployments, ReplicaSets, and an Ingress), `motiv-labs/janus` (a PodDisruptionBudget and an Ingress, plus Go and Action findings), `FairwindsOps/pluto` (two extensions/v1beta1 Deployments outside its test directories), `luksa/kubernetes-in-action` (thirty-odd manifests across extensions, apps/v1beta1 and v1beta2, PodSecurityPolicy, CronJob, StatefulSet, CRD, and Ingress), `ossf/package-analysis` (an autoscaling/v2beta2 HorizontalPodAutoscaler), `knrt10/kubernetes-basicLearning` (a networking.k8s.io/v1beta1 Ingress), and five with no Kubernetes finding: `hasura/skor` (the removed version appears only as a `kind: List` item), `stefanprodan/gitops-istio` (the removed version appears only as a Flagger `autoscalerRef`), `doitintl/kube-no-trouble` (the removed versions are in `fixtures/`), `elastic/crd-ref-docs`, and `yaml-schema/yaml-schema`, `shepherd44/helm-charts` (current API versions).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the Kubernetes ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a migration commit for the finding, so none is cited. The rules' dates and removal releases come from the Kubernetes migration guide, not from these repositories. A run of `npm run validate:public-repos -- --ecosystem kubernetes` on 2026-10-23 over the seventeen Kubernetes entries reported no false positives or false negatives, with 67 expected `kubernetes` findings, all true.

## Kubernetes blind selection

The five earliest Kubernetes repositories were chosen knowing their result, so each records `selection: "targeted"`; the twelve below record `selection: "blind"`.

The blind rule, fixed on 2026-10-23 before Evergreen ran on these additions: GitHub code search restricted to `--extension yaml` (`gh search code <query> --limit 60`) for each of `extensions/v1beta1`, `policy/v1beta1`, `batch/v1beta1`, `autoscaling/v2beta2`, and `networking.k8s.io/v1beta1` (removed API groups, expected to produce findings), and `apps/v1 Deployment` (current API, expected to produce none). Per query, walk the results in order and keep the first two unique repositories, skipping forks, archives, repositories already in the corpus or chosen by an earlier query, and repositories larger than 5,000 KB on GitHub. Pin each at its default-branch commit on that date. The twelve are `hasura/skor`, `kelseyhightower/kubernetes-cluster-federation`, `motiv-labs/janus`, `FairwindsOps/pluto`, `luksa/kubernetes-in-action`, `doitintl/kube-no-trouble`, `ossf/package-analysis`, `stefanprodan/gitops-istio`, `knrt10/kubernetes-basicLearning`, `elastic/crd-ref-docs`, `yaml-schema/yaml-schema`, and `shepherd44/helm-charts`. The query returns different results on another day, so the pinned list above, not a re-run, is the record.

Ground truth: for each repository every `apiVersion` line naming a removed group and version was listed with `grep` over the pinned YAML files and compared with the report, independently of Evergreen's own output, and each reported finding's `kind` was read from its manifest. Every expected finding has a `maintainer-review` note naming the path, the exact line, and the kind.

## Java and Kotlin corpus

Seventeen public repositories at pinned commits cover the `java` detector. Targeted (chosen knowing their result): `kagkarlsson/db-scheduler` (a multi-module Maven build, no findings), `piomin/sample-spring-reactive` (a `java.version` of 19), `danvega/loom` (`java.version`, `source`, and `target` of 19), `krakowski/jextract-demo` (a Gradle Kotlin DSL toolchain of 22), and `Descended/Henesys` (a `mysql:mysql-connector-java` 8.0.33 dependency, which the artifact's own POM relocates).

Blind (rule below): `jzyong/GameServer4j` (JDK 13 and 14 compile levels across nine modules), `latexdraw/latexdraw` (`java.version` 14), `amigoscode/login-registration-backend` and `TechPrimers/spring-batch-example-1` (`java.version` 15), `moditect/jfrunit` (`java.version` 16, plus `actions/cache`, `actions/checkout`, and `actions/setup-java` at v2), `advanced-security/monorepo-filtering-workaround` (`java.version` 18, plus `actions/checkout@v3`), `ChristianAA/selenium-springboot-example` (JDK 18, plus Action pins), `stepstone-tech/doom-graalvm` (`java.version` 19), `vladannovi1234/ecommerce-springboot-react` (JDK 19 compile levels in ten modules), and three with no Java finding: `neo4j-examples/movies-java-spring-data-neo4j` and `stirante/RuneChanger` (JDK 17 and 11, both LTS; the first also has SHA-pinned Action findings), and `eh3rrera/graphql-java-spring-boot-example` (JDK 11 in the project, JDK 16 only inside a Maven profile, which the detector does not judge).

Every finding in these repositories is recorded, not only the Java ones, and each was checked by reading its line at the pinned commit. The ground truth is a `maintainer-review` note naming the path and line; none of the repositories has a migration commit for the finding. The JDK dates come from the Oracle Java SE Support Roadmap and the Temurin support page, and the relocation from the Maven Central POM, not from these repositories. A run of `npm run validate:public-repos -- --ecosystem java` on 2026-10-23 over the seventeen Java entries reported no false positives or false negatives, with 66 expected `java` findings, all true.

## Java and Kotlin blind selection

The five earliest Java repositories were chosen knowing their result, so each records `selection: "targeted"`; the twelve below record `selection: "blind"`.

The blind rule, fixed on 2026-10-23 before Evergreen ran on these additions: GitHub code search `<java.version>N</java.version>` restricted to `filename:pom.xml`, for N in 14, 15, 16, 18, 19 (non-LTS, expected to produce findings) and 17 (LTS, expected to produce none), `gh search code --limit 60`. Per N, walk the results in order and keep the first two unique repositories whose matching path is exactly the root `pom.xml`, skipping forks, archives, repositories already in the corpus, and repositories larger than 50,000 KB on GitHub. Pin each at its default-branch commit on that date. The twelve are, in order: `jzyong/GameServer4j`, `latexdraw/latexdraw`, `amigoscode/login-registration-backend`, `TechPrimers/spring-batch-example-1`, `moditect/jfrunit`, `eh3rrera/graphql-java-spring-boot-example`, `advanced-security/monorepo-filtering-workaround`, `ChristianAA/selenium-springboot-example`, `stepstone-tech/doom-graalvm`, `vladannovi1234/ecommerce-springboot-react`, `neo4j-examples/movies-java-spring-data-neo4j`, and `stirante/RuneChanger`. `piomin/sample-spring-reactive` was skipped (already pinned). The query returns different results on another day, so the pinned list above, not a re-run, is the record.

Ground truth: for each repository every JDK declaration (`java.version`, `maven.compiler.*`, compiler-plugin `source`, `target`, and `release`, Gradle compatibility and toolchain settings, and `.java-version`, `.sdkmanrc`, `.tool-versions`) was listed with `grep` over the pinned files and compared with the report, independently of Evergreen's own output. Every expected finding has a `maintainer-review` note naming the path, the exact line, and the Oracle roadmap fact the rule rests on.

## Ruby corpus

Five public repositories at pinned commits cover the `ruby` detector: `rack/rack` (no findings), `Shopify/packwerk` (`.ruby-version` 3.0.4, plus three `actions/checkout@v2` pins), `thoughtbot/suspenders` (`.ruby-version` 3.2.2, plus one `actions/checkout@v4` pin), `github/view_component` (`.ruby-version` 2.7.1), and `puma/puma` (a Gemfile `ruby "3.2.0"` directive in a local benchmark).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the Ruby ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a reviewed migration entry in the mining log for the finding, so none is cited as `migration-commit`. The EOL dates come from the [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) page, not from these repositories.

## PHP corpus

Five public repositories at pinned commits cover the `php` detector: `laravel/laravel` (a current Laravel application skeleton, no findings), `jobbyphp/jobby` (`swiftmailer/swiftmailer`), `ZF-Commons/ZfcUser` (`zendframework/zend-stdlib`), `MacPaw/behat-orm-context` (`config.platform.php` 7.4.33, plus `actions/checkout@v4` and `actions/cache@v4` pins), and `Kalpa-Services/mmg-wp-plugin` (`config.platform.php` 7.4, plus `actions/checkout@v4`, `actions/github-script@v6`, and `actions/setup-go@v4` pins).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the PHP ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a reviewed migration entry in the mining log for the finding, so none is cited as `migration-commit`. Package abandonment comes from Packagist and the Laminas / Symfony announcements; the PHP 7.4 end-of-life date comes from the [PHP unsupported branches](https://www.php.net/supported-versions.php) page, not from these repositories.

## Swift corpus

Thirteen public repositories at pinned commits cover the `swift` detector.

Targeted: `seedco/Formalist` (`.xcode-version` 9.3.1 and an iOS 12 sample app), `bojan/Troop` (`.xcode-version` 10.2.1), `s2mr/xc` (`.xcode-version` 14.2.0), `s2mr/L10nLint` (`.xcode-version` 16.4.0), `Simperium/simperium-ios` (four iOS 8 application targets), and `JohnSundell/Files` (no findings).

Blind (rule below): `microsoft/SwiftStreamingMarkdown` (`.xcode-version` 16.0), `hhru/mvi-swift` (`.xcode-version` 16.0, plus `actions/checkout@v3` and Ruby 3.1), `babylonhealth/Stevenson` (`.xcode-version` 11.6), `cgoldsby/TvOSMoreButton` (`.xcode-version` 13.2.1, plus `actions/checkout@v2`, `actions/cache@v2`, and Ruby 2.7), `griffin-stewie/BudouX.swift` (`.xcode-version` 14.3.1), `micahflee/TM-SGNL-iOS` (no Swift finding: the pin reads `Xcode 16.1` and the app target is iOS 15; the same pin has `actions/checkout@v4`, `actions/upload-artifact@v4`, and Ruby 3.2), and `paulgessinger/swift-paperless` (`.xcode-version` 27.1, no findings).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the Swift ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a reviewed migration entry in the mining log for the finding, so none is cited as `migration-commit`. The Xcode acceptance dates come from [App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/), not from these repositories.

## Swift blind selection

The six earliest Swift repositories were chosen knowing their result, so each records `selection: "targeted"`. The seven below record `selection: "blind"`.

The blind rule, fixed on 2026-10-21 before Evergreen ran on these additions: GitHub code search for `filename:xcode-version`. Walk unique repositories whose path is exactly `.xcode-version`, in the order returned that day. Skip a repository when it is a fork, archived, already in the corpus, not primarily Swift, or larger than 50,000 KB on GitHub. Keep it when the default branch still contains `.xcode-version`. Stop once the beta counts in [decision 0013](decisions/0013-detector-maturity.md) are met, which happened at seven. The seven, pinned at their default-branch commit on that date, are search results 12, 19, 20, 22, 24, 28, and 31: `paulgessinger/swift-paperless`, `microsoft/SwiftStreamingMarkdown`, `hhru/mvi-swift`, `babylonhealth/Stevenson`, `cgoldsby/TvOSMoreButton`, `micahflee/TM-SGNL-iOS`, and `griffin-stewie/BudouX.swift`. Results before and between those were skipped by the rule above (size, language, or an existing pin), including `signalapp/Signal-iOS`, `Simperium/simperium-ios`, and `seedco/Formalist`. The query returns different results on another day, so the pinned list above, not a re-run, is the record.

Ground truth: for each repository the `.xcode-version` line, every application-target `IPHONEOS_DEPLOYMENT_TARGET`, and any other detector declaration on that pin were read from the file and compared with the report. `swift-paperless` pins Xcode 27.1, which neither Xcode rule covers, and its workflows are commit-pinned at majors the rules do not match, so the expected set is empty. `TM-SGNL-iOS` writes `Xcode 16.1`, which is not a numeric pin, and its application target is iOS 15, so the Swift detector reports nothing there; the Ruby pin and the Action refs are expected findings of those detectors. `BudouX.swift` pins `14.3.1`. Every expected finding has a `maintainer-review` note naming the path, the exact line, and the vendor date the rule rests on.

## Serverless corpus

Ten public repositories at pinned commits cover the `serverless` detector.

Targeted: `Dwolla/webhook-receiver` (`provider.runtime` `nodejs14.x`), `haltakov/natural-language-image-search` (`provider.runtime` `python3.8`), `HUK-COBURG/innoforum-aws-serverless` (SAM and Terraform `nodejs14.x`, plus GitHub Actions pins), `BaptisteLecat/gcp_architect_certification` (Terraform Google Cloud Functions `nodejs14`), and `aws-samples/sam-python-crud-sample` (five SAM `python3.8` functions, plus GitHub Actions pins).

Blind (rule below): `serverless/examples` and `AnomalyInnovations/serverless-stack-demo-api` (no findings), `Swizec/lambda-screenshot-as-a-service` (`nodejs14.x`), `skojin/send-gmail-lambda` (`ruby2.7`), and `livgust/covid-vaccine-scrapers` (seven SAM `nodejs14.x` functions, plus Node.js and GitHub Actions pins).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the Serverless ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line; none of these repositories has a reviewed migration entry in the mining log for the finding, so none is cited as `migration-commit`. The AWS Lambda and Google Cloud Functions end-of-life dates come from the [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) table and the [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support) schedule, not from these repositories.

## Serverless blind selection

The five earliest Serverless corpus repositories were chosen knowing their result, so each records `selection: "targeted"`. The five below record `selection: "blind"`.

The blind rule, fixed on 2026-10-21 before Evergreen ran on these additions: GitHub code search for `runtime: nodejs14.x` in `filename:serverless.yml`, plus the first results of `Runtime: nodejs14.x` / `Runtime: python3.8` in SAM `template.yaml` and of current `runtime: nodejs22.x` examples, walking public non-fork repositories in the order returned that day. Keep a repository when its default-branch tip contains `serverless.yml`, `template.yaml` / `template.yml`, or a Terraform `aws_lambda_function` / `google_cloudfunctions*_function` runtime declaration; skip archives and the repositories already pinned as targeted. Stop at five. The five, pinned at their default-branch commit on that date, are `serverless/examples`, `AnomalyInnovations/serverless-stack-demo-api`, `Swizec/lambda-screenshot-as-a-service`, `skojin/send-gmail-lambda`, and `livgust/covid-vaccine-scrapers`. The query returns different results on another day, so the pinned list above, not a re-run, is the record.

Ground truth: for each repository the runtime lines (and any other detector findings on the same pin) were listed by reading the pinned files and compared with the report, independently of Evergreen's own output. Every expected finding has a `maintainer-review` note naming the path, the exact line, and the vendor date the rule rests on.

## .NET blind selection

The six earliest .NET repositories were chosen knowing their result, so each records `selection: "targeted"`. The `selection` field is optional on every corpus entry; `"blind"` means the repository was chosen by a rule fixed before Evergreen ran on it ([decision 0013](decisions/0013-detector-maturity.md)), and an entry without the field counts as not blind.

The blind rule, run on 2026-10-19: GitHub repository search for `language:C#`, 100 to 500 stars, last pushed from 2021-01-01 to 2024-12-31, not a fork, not archived, sorted by stars descending (`gh search repos --language "C#" --stars "100..500" --updated "2021-01-01..2024-12-31" --archived=false --include-forks=false --sort stars --order desc`). Walk the results in order and take each repository whose default branch has at least one `*.csproj`, `*.fsproj`, `*.vbproj`, or `global.json`; skip the others (Unity packages with no project file). Stop at twelve, whatever Evergreen reports for them. The twelve, pinned at their default-branch commit on that date, are results 1, 3, 5, 7, 9, 10, 11, 12, 13, 14, 15, and 16 of that search: rikimaru0345/Ceras, takuya-takeuchi/DlibDotNet, 0xthirteen/SharpStay, NightfallGT/Mercurial-Grabber, Dec0ne/ShadowSpray, Ceiridge/Chrome-Developer-Mode-Extension-Warning-Patcher, TerribleDev/OwinOAuthProviders, chsakell/mvcarchitecture, SeriaWei/ASP.NET-MVC-CMS, stanzhai/Html2Article, BeichenDream/SharpToken, and nettitude/SharpSocks. Ranks 2, 4, 6, and 8 have no project file. The query returns different results on another day, so the pinned list above, not a re-run, is the record.

Ground truth: for each repository the target frameworks, SDK pins, and package references were listed by `grep` over the pinned files and compared with the report, independently of Evergreen's own output. Every expected finding has a `maintainer-review` note naming the path, the exact line, and the vendor date the rule rests on. Ceras was the one miss: it targets `netcoreapp2.1` and `netcoreapp2.2`, which had no rule, so the registry gained the 1.x, 2.x, and 3.0 lines in the same change.

## CI runner images corpus

Five public repositories at pinned commits cover the `ci-images` detector: `oatpp/oatpp` (`ubuntu-20.04` and `ubuntu-22.04` hosted images), `Chinachu/Mirakurun` (four `ubuntu-22.04` pools, plus a deprecated `tslint` dependency), `microsoft/Sysmon-Linux` (`ubuntu-22.04`, plus `actions/checkout` v4.1.1), `aliostad/CacheCow` (`ubuntu-22.04`, plus .NET target frameworks past or scheduled for end of support), and `Windos/PoshNotify` (Azure Pipelines pools that use only `*-latest` images, no findings).

Because the corpus scans every detector, every finding in these repositories is recorded, not only the CI image ones. Each expected finding was checked by reading its line at the pinned commit, and its `groundTruthSource` is a `maintainer-review` note naming the path and line. The Azure dates come from the [hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule) and the [Azure DevOps blog deprecation plan](https://devblogs.microsoft.com/devops/upcoming-updates-for-azure-pipelines-agents-images/), not from these repositories. All five were chosen knowing their image labels, so each records `selection: "targeted"`.

## The 300-repository corpus

The corpus now has 300 repositories: the 189 earlier entries and 111 added in one pass, every one with `selection: "blind"`. They fill the ecosystems that had the fewest repositories: container, Go, Rust, Ruby, PHP, Android, C/C++, CI runner images, Dart, Terraform, database runtimes, and shell got seven each, and serverless, GitHub Actions, and Swift got nine each.

The blind rule, fixed on 2026-10-23 before Evergreen ran on these additions: for each query below, run `gh search code <query> --limit 60`, walk the results in the order returned that day, and keep the first N unique repositories that are not forks, not archived, not larger than 50,000 KB on GitHub, and not already in the corpus (or chosen by an earlier query); where the entry says root only, the matching path must be at the repository root. Pin each at its default-branch commit on that date. Licensing: only repository metadata, pinned commit IDs, paths, line numbers, and one short quoted line per finding are stored; no repository content is vendored, and each repository is fetched from GitHub at its pinned commit at run time. The query returns different results on another day, so the pinned list, not a re-run, is the record.

- `go` (7): `gh search code go 1.22 --filename go.mod`; `gh search code go 1.26 --filename go.mod`: `lwolf/kube-cleanup-operator`, `ICKelin/gtun`, `keycard-tech/keycard-go`, `Johonsoy/SmartStashDB`, `replicate/cog`, `charmbracelet/wish`, `slackhq/go-audit`.
- `rust` (7): `gh search code atty --filename Cargo.toml`; `gh search code ansi_term --filename Cargo.toml`; `gh search code tempdir --filename Cargo.toml`: `nikivdev/code`, `rathole-org/rathole`, `ogham/dog`, `suptejas/fleet`, `dflemstr/rq`, `databricks/click`, `gchp/iota`.
- `ruby` (7): `gh search code 3.1.4 --filename .ruby-version`; `gh search code 2.7.8 --filename .ruby-version`; `gh search code 3.4.1 --filename .ruby-version`: `67272-App-Design-Dev/PATS_v1_r7`, `HomeBusProjects/HomeBus`, `Kgomotso196/Blog`, `nmacawile/rails-chat-api`, `maedadev/bizside-ruby`, `nsidc/vagrant-vsphere`, `nov/web_authn_sample`.
- `android` (7): `gh search code com.android.billingclient:billing --filename build.gradle`; `gh search code com.android.billingclient:billing --filename build.gradle.kts`: `Aefyr/SAI`, `anjlab/android-inapp-billing-v3`, `Eajy/MaterialDesignDemo`, `serso/android-checkout`, `facebook/facebook-android-sdk`, `BranchMetrics/android-branch-deep-linking-attribution`, `d4rken-org/octi`.
- `cpp` (7): `gh search code cmake_minimum_required(VERSION 2.8 --filename CMakeLists.txt`; `gh search code cmake_minimum_required(VERSION 3.28 --filename CMakeLists.txt`: `BYVoid/uchardet`, `Xtra-Computing/thundergbm`, `wavebitscientific/functional-fortran`, `karimnaaji/vectiler`, `Off-World-Live/obs-spout2-plugin`, `QBDI/QBDI`, `Hapaxia/SelbaWard`.
- `ci-images` (7): `gh search code ubuntu-20.04 --filename azure-pipelines.yml`; `gh search code ubuntu-24.04 --filename azure-pipelines.yml`: `revery-ui/revery`, `microsoft/FASTER`, `hasura/graphqurl`, `inikep/lizard`, `Jackett/Jackett`, `dotnet/vscode-csharp`, `isomorphic-git/isomorphic-git`.
- `database` (7): `gh search code postgres:13 --extension yml`; `gh search code engine_version = "5.7" --extension tf`: `gitcoinco/grants-stack`, `jayfk/launchr`, `Kuper-Tech/sbmt-outbox`, `replicase/pgcapture`, `tmknom/example-pragmatic-terraform`, `PacktPublishing/Effective-DevOps-with-AWS-Second-Edition`, `RajitPaul11/terraform_aws`.
- `container` (7): `gh search code FROM node:24 --filename Dockerfile`; `gh search code FROM node:16 --filename Dockerfile`: `daimon3332/address`, `SpectrAI-Initiative/InnoClaw`, `navikt/security-playbook`, `rsmbl/Resemble.js`, `fanchangyong/deershare`, `firemakergk/aquar-home`, `sibbl/hass-lovelace-kindle-screensaver`.
- `terraform` (7): `gh search code required_version 1.12 --extension tf`; `gh search code required_version ~> 1.12 --extension tf`; `gh search code required_version --extension tf --filename versions.tf`: `skax-ca/iac-module-library`, `ql4b/cloudless-infra`, `terraform-google-modules/terraform-google-container-vm`, `cloudposse/terraform-aws-cicd`, `cloudposse/terraform-aws-ec2-instance`, `terraform-google-modules/terraform-google-log-export`, `GoogleCloudPlatform/notebooks-blueprint-security`.
- `node-actions` (9): `gh search code actions/checkout@v2 --extension yml`; `gh search code actions/checkout@v6 --extension yml`: `jugglerchris/rust-html2text`, `CausalAIBook/MetricsMLNotebooks`, `realabbas/Github-Actions-React-Native`, `ktye/i`, `lamdow8/lamdow8.github.io`, `bjdash/apic`, `lpereira/lwan`, `shivammathur/setup-php`, `hellofresh/action-changed-files`.
- `shell` (7): `gh search code #Requires -Version 7 --extension ps1`; `gh search code PowerShellVersion --filename psd1`: `domaindrivendev/Swashbuckle.AspNetCore`, `PowerShell/PSReadLine`, `SteeltoeOSS/Steeltoe`, `Kevin-Robertson/Inveigh`, `psake/psake`, `cyberark/ACLight`, `pester/Pester`.
- `php` (7): `gh search code ^7.4 --filename composer.json`; `gh search code ^8.3 --filename composer.json`: `dreamfactorysoftware/dreamfactory`, `doctrine/annotations`, `symfony/routing`, `driesvints/blade-icons`, `spatie/laravel-backup`, `mckenziearts/laravel-notify`, `spatie/db-dumper`.
- `dart` (7): `gh search code ^3.8.0 --filename pubspec.yaml`; `gh search code ^3.10.0 --filename pubspec.yaml`: `bensonarafat/super_tooltip`, `Mr-Pepe/syncable`, `rithik-dev/firebase_phone_auth_handler`, `dickermoshe/convex-dart`, `OpenFlutter/fluwx`, `Yubico/yubioath-flutter`, `dartgfx/gpux`.
- `serverless` (9): `gh search code nodejs14.x --filename serverless.yml`; `gh search code python3.8 --filename template.yaml`; `gh search code nodejs22.x --filename serverless.yml`: `SmartThingsCommunity/weather-color-light-smartapp-nodejs`, `ZeroSharp/serverless-php`, `Toola-bakery/Toola`, `ashokatechmin/Messcat`, `serverlesspub/imagemagick-aws-lambda-2`, `awslabs/aws-config-rdklib`, `aws-samples/aws-lambda-extensions`, `slackapi/bolt-js`, `webpro-nl/knip`.
- `swift` (9): `gh search code xcode --filename .xcode-version`; `gh search code IPHONEOS_DEPLOYMENT_TARGET = 12.0 --filename project.pbxproj`: `sarthak-behl/Signal-iOS`, `palak-ios-play/SecureChat-iOS`, `NorthWolfLabs/CodexGauge`, `Shopify/mobile-buy-sdk-ios`, `ReSwift/ReSwift`, `Swinject/Swinject`, `aslanyanhaik/youtube-iOS`, `square/Valet`, `swiftlang/swift-corelibs-xctest`.

Ground truth: for each repository the harness report was read line by line at the pinned commit, and every expected finding has a `maintainer-review` note quoting the path, line, and the matching text. The Go, Rust, Ruby, Android, C/C++, CI image, serverless, and GitHub Actions findings were also cross-checked against an independent `grep` over the pinned files (not Evergreen's output); the only differences are the scope boundaries below. Because the corpus scans every detector, every finding in these repositories is recorded, not only the ones for the ecosystem it was selected for. Findings of the npm, Node.js, Python, and .NET detectors were checked by reading the line, not by a second search. Several repositories that matched a version query have no finding in that ecosystem, which is expected: a range such as PHP `^7.4 || ^8.0` or Dart `sdk: ^3.8.0` still allows a supported release and is not an end-of-life declaration.

Scope boundaries seen while checking, none of which is a finding in this corpus: the GitHub Actions detector reads only the root `.github/workflows` directory, so nested workflows (`pkg/cli/init-templates/base/.github/workflows` in `replicate/cog`, a `fixtures` directory in `webpro-nl/knip`) and composite `action.yml` files (`realabbas/Github-Actions-React-Native`, `awslabs/aws-config-rdklib`, `sarthak-behl/Signal-iOS`) are not scanned; the CI image detector reads files named `azure-pipelines.yml`, not `azure-pipelines-full.yml` (`microsoft/FASTER`); and the Android detector does not report a Play Billing pin written as `"gplayImplementation"("...")` (`d4rken-org/octi`) or inside an `androidTestImplementation` call (`BranchMetrics/android-branch-deep-linking-attribution`). These are candidates for follow-up issues, not corpus entries.

## Precision thresholds

[`benchmarks/thresholds.json`](../benchmarks/thresholds.json) sets a precision floor per detector (`github-actions`, `nodejs`, `npm`, `python`, `dotnet`, `java`, `kubernetes`, `serverless`, and `swift` enforce it; a detector is named by the first segment of its rule ids). The harness scores each detector, prints the figures under `detectors` in its JSON, and reports `thresholdViolations`. A stable detector below its `minPrecision` (0.95 today) fails the run with a line such as:

```text
THRESHOLD  npm: precision 0.9 is below the required 0.95
```

A detector at `beta` or `stable` also has a recall floor, 0.80 and 0.90 (decision 0013), computed as true positives over true positives plus false negatives; a full run below it prints `THRESHOLD  <detector>: recall … is below the required …`, fails, and cannot be recorded. Every corpus entry records `selection` (`blind` or `targeted`), and a test fails when one does not; entries added before the field existed were all picked from reviewed migration commits or known findings, so they record `targeted`.

The weekly corpus workflow therefore fails on a precision regression even if the exact-match comparison is later relaxed. Mark a new detector `"stable": false` until its corpus coverage is meaningful; it is still scored and reported but never fails the run. Never lower a floor to make a run pass.

## Fetching and the checkout cache

The harness fetches up to sixteen repositories at once; change that with `--concurrency <n>` or `EVERGREEN_CORPUS_CONCURRENCY`. Scans and the report stay in corpus order.

By default it fetches each repository as a blobless shallow fetch plus a sparse checkout of only the files the detectors declare they read ([decision 0015](decisions/0015-corpus-fetch-strategy.md)): a cold full run takes about a minute and fetches about 190 MB, and the results are identical to a full checkout. `EVERGREEN_CORPUS_FETCH=shallow` fetches complete checkouts instead. `node dist/benchmarks/fetch-strategies.js --strategy <shallow|sparse|tarball>` re-measures the options.

Every corpus commit is pinned, so a checkout never changes. Set `EVERGREEN_CORPUS_CACHE=<dir>` (for example `~/.cache/evergreen-corpus`) to keep each one on disk as `<owner>__<repo>@<commit>` and skip the network when it is already there. Entries are written to a temporary directory and renamed into place, and `.git` is removed because scans read files only, so an interrupted run never leaves a half-filled entry. A sparse entry carries an `.evergreen-fetch` marker naming the declarations it was built from; if a detector later declares more files, that entry is refetched rather than reused. Unset, there is no cache and a run behaves as before. A warm run reports the same true positives, false positives, false negatives, and findings as a cold one.

## Running a subset

```bash
npm run validate:public-repos -- --ecosystem php
npm run validate:public-repos -- --ecosystem php --ecosystem ruby
npm run validate:public-repos -- --repo laravel/framework
```

`--ecosystem <name>` and `--repo <owner/name>` are repeatable; naming both selects the union, reported in corpus order. An unknown name is an error that lists the valid ones. A filtered run still fails on any false positive or false negative among the entries it covers, but it is not a full run: it does not enforce the per-detector precision floors, it writes no `lastFullRun`, the JSON report says `"fullRun": false` with a `filter` line, and the run prints `FILTERED RUN` on stderr. Only an unfiltered run can be recorded or compared with the full-corpus claims in this document.

### Re-running only what failed

After fixing a detector, re-check just the repositories that had a mismatch:

```bash
npm run validate:public-repos -- --output corpus-result.json     # a run with UNEXPECTED or MISSING lines
npm run validate:public-repos -- --failed-from corpus-result.json
```

`--failed-from <report.json>` runs the repositories whose entry in that report has an `unexpected` or `missing` finding; any that have left the corpus are skipped. It is a filtered run like the others (`FILTERED RUN` on stderr, `"fullRun": false`) and never counts as a full run. A report with no mismatches prints that and exits 0 without fetching anything.

### Comparing with an earlier run

```bash
npm run validate:public-repos -- --compare corpus-result.json
npm run validate:public-repos -- --compare benchmarks/thresholds.json
```

`--compare <file>` prints what moved since that file. Against an earlier report it lists `ADDED` and `REMOVED` findings per repository and the per-detector true-positive, false-positive, and false-negative differences (`DELTA`), computed over the repositories present in both, so a filtered run compares like with like. Against `benchmarks/thresholds.json` it uses the recorded `lastFullRun` for the per-detector numbers only. Comparing never changes the exit code: false positives, false negatives, and the precision floors still decide it, and an unreadable comparison file is reported without failing the run.

### Managing the cache

A cache of complete checkouts is about 1.5 GB on disk; the default sparse entries need about 570 MB. A suggested location is `~/.cache/evergreen-corpus`; set `EVERGREEN_CORPUS_CACHE` to it in your shell profile.

```bash
npm run corpus:cache -- status                       # directory, entry count, total size, entries no longer in the corpus
npm run corpus:cache -- prune --dry-run              # what removing entries no longer in the corpus would do
npm run corpus:cache -- prune                        # remove entries that are no longer in the corpus
npm run corpus:cache -- prune --max-size 800         # remove least recently used entries until the cache is at most 800 MB
npm run corpus:cache -- prune --all                  # empty the cache
```

`--dry-run` works with every `prune` form and removes nothing. Every cache hit refreshes the entry's last-used time, which is what `--max-size` orders by. The commands only ever touch directories directly under the cache directory whose names look like `<owner>__<repo>@<40-hex commit>`; anything else in there is left alone, and an empty or root-like path (`/`, your home directory, a single top-level directory) is refused.

### Warm ahead, run offline

```bash
npm run corpus:warm                       # fetch every missing checkout into the cache and stop; no scan
npm run corpus:warm -- --ecosystem php    # the same filters as a run
npm run validate:public-repos -- --offline
```

Both need `EVERGREEN_CORPUS_CACHE` and print how many entries were already cached. `--offline` uses the cache only: if an entry is missing it fails before scanning anything, with exit code 2 and one message that lists every missing `repository@commit`. After `corpus:warm`, an `--offline` run reports the same results as an online one. A good habit is `npm run corpus:warm` after pulling `main`, so a later run never waits on a download.

### Running only what a change affects

```bash
npm run validate:public-repos -- --changed            # changes since origin/main, plus uncommitted and untracked files
npm run validate:public-repos -- --changed release/1  # a different base
```

`--changed [base]` reads `git diff --name-only <base>...HEAD` together with uncommitted and untracked files and maps them to corpus ecosystems with [`benchmarks/corpus-affected.ts`](../benchmarks/corpus-affected.ts): `src/detectors/<name>`, `registry/<file>.json`, and `tests/fixtures/<name>/` map to the ecosystems that detector serves (for example `src/detectors/npm.ts` and `registry/nodejs.json` to `node`, the GitHub Actions detector to `node-actions`), and shared files map to every ecosystem whose detectors use them (`src/source-usage.ts` to nine ecosystems; `src/engine.ts`, `src/sdk.ts`, and the other scan-wide files to all twelve). It prints one `changed:` line per chosen ecosystem naming the paths behind it. If nothing maps, it says so and exits 0 without fetching. The result is a filtered run like any other, and it combines with `--ecosystem` and `--repo`.

The map is tested: every built-in detector, every corpus ecosystem, every directory under `src/detectors/`, every file in `registry/`, and every shared file a detector imports must be listed, so adding a detector fails `npm run check` until it is mapped. Other work can import the same module, for example a pull request workflow.

## Run cost and budget

Every report carries a `cost` block: total wall time, the summed fetch time (larger than the wall time when fetches overlap), cache hits and misses, and the size of the git data fetched (git does not expose network bytes, so this is the `.git` size of each fetched checkout). The run prints it as a `COST` line, and the weekly workflow shows it in the job summary.

`benchmarks/thresholds.json` holds the `budget`: a wall-time limit in seconds and a fetched-bytes limit. Going over either prints a `BUDGET` warning (a `::warning::` annotation in Actions), lists it in the report's `budgetWarnings`, and flags it in the job summary. A budget overrun never fails the run; correctness is decided by false positives, false negatives, and the precision floors alone. Tighten the budget in a pull request when a faster fetch strategy lands, and raise it only with a stated reason.

## Stalled fetches

One hung connection must not hold a run. Each fetch passes git's low-speed abort (`http.lowSpeedLimit=1000`, `http.lowSpeedTime=30`: below 1 KB/s for 30 s) and a hard limit of 120 s per attempt, changed with `EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS`. A stall counts as a failed attempt, so it is retried and, when every attempt fails, reported with the repository name. At the end of every run the five slowest fetches print as `SLOWEST` lines.

## Reading a run

By default a run prints a short table on stdout instead of the full JSON: true positives, false positives, false negatives, and precision per ecosystem and per detector, then every `UNEXPECTED` and `MISSING` line, then a one-line wall-time summary. Progress goes to stderr as one line per fetched repository (`12/107 owner/name 2.1s`). The `COST`, `SLOWEST`, and `BUDGET` lines follow on stderr.

```bash
npm run validate:public-repos -- --output corpus-result.json   # table on screen, full JSON in the file
npm run validate:public-repos -- --json > corpus-result.json   # JSON on stdout; the table moves to stderr
```

`--output <file>` writes the full JSON report whatever the result, so a failing run still leaves it behind. The weekly workflow uses `--output` and uploads that file as the `corpus-result-<run id>` artifact.

## Recording a full run

```bash
npm run record:corpus-run
```

One command replaces the hand edits. It runs the whole corpus in verify mode and, only when that passes, writes the run into `lastFullRun` in `benchmarks/thresholds.json` (date, the current `HEAD` commit, repository and finding counts, precision, recall, and true positives, false positives, and false negatives for every detector, zero for one that reported nothing), then regenerates `docs/dashboard/data.json` (`npm run build:dashboard`), the accuracy table below (`npm run build:coverage`), and `docs/llms-full.txt`. It leaves the changes uncommitted so you can review the diff.

It refuses, and changes nothing, when:

- the working tree has uncommitted changes, because the recorded commit would not describe them;
- any run-narrowing flag is passed (`--ecosystem`, `--repo`, `--failed-from`, `--changed`), or `--observe`, `--warm`, `--output`, `--json`, or `--compare`;
- the run did not cover every corpus entry, was not in verify mode, or has any false positive or false negative, or a detector below its precision floor.

Other harness flags such as `--concurrency` and `--offline` are passed through. The dashboard tests read the recorded commit, counts, and age from `benchmarks/thresholds.json` instead of repeating them, so recording a new run needs no test edits.

## Pull request check

Pull request CI (`ci.yml`) stays offline, so a detector or rule change that adds false positives would only be found in the weekly run. [`.github/workflows/corpus-pr.yml`](../.github/workflows/corpus-pr.yml) closes that gap in a separate workflow: when a pull request touches `src/`, `registry/`, `tests/fixtures/`, or `benchmarks/`, it maps the changed files to corpus ecosystems with the same `--changed` logic described above and runs only those, using the weekly run's checkout cache (restore only).

Before it fetches anything, the workflow also runs `node dist/benchmarks/corpus-snapshot.js`, and the same comparison runs in `npm test` for every pull request. [`benchmarks/corpus-snapshot.json`](../benchmarks/corpus-snapshot.json) records how many findings, in how many repositories, the corpus expects for each detector. A change that removes or weakens an expectation, so that a known finding would no longer be required, fails with a `SNAPSHOT` line until the snapshot is updated on purpose with `node dist/benchmarks/corpus-snapshot.js --write`; that edit is a reviewable diff. Adding expectations never fails; run `--write` to ratchet the snapshot up.

The job summary lists the chosen ecosystems and every `UNEXPECTED` and `MISSING` line; the full report is attached as the `corpus-pr-result-<run id>` artifact. If nothing maps, it says so and fetches nothing. The workflow is **not a required check**: keep it out of branch protection, because it needs the network and GitHub's availability. It has `contents: read` only, no secrets, and no `pull_request_target`, and the base branch reaches the shell through an environment variable, never an inline expression. Treat a red run as a finding to explain in the pull request, using the rules in "Weekly run and refreshing pins" above.

## Weekly run and refreshing pins

Pull request CI never touches the network, so the corpus is checked by [`.github/workflows/corpus.yml`](../.github/workflows/corpus.yml) every Monday and on demand (Actions → Public corpus → Run workflow). The result is uploaded as the `corpus-result-<run id>` artifact even when the comparison fails. A failing run prints one line per mismatch, for example:

```text
UNEXPECTED owner/repo@4ec1ebe0fa: github-actions.setup-node.node20:.github/workflows/ci.yml:20
MISSING    owner/repo@4ec1ebe0fa: nodejs.runtime.eol-18:package.json:83
```

`UNEXPECTED` means Evergreen reported a finding the corpus does not list; `MISSING` means a listed finding was not reported. Because every commit is pinned, a mismatch means Evergreen's rules or detectors changed, not the repository. Decide which side is right before touching the corpus: fix the detector or rule when the corpus is right, and update the expected entry (with its `groundTruthSource`) only when the new result is correct.

To move an entry to a newer commit, change its `commit` to the full 40-character SHA, run `npm run observe:public-repos` to list what Evergreen now reports, review every difference against the repository at that commit, update `expected`, and run `npm run validate:public-repos` until it passes. Never refresh a pin only to make a failing run green.

## Differential testing against Renovate

Renovate is the closest widely used tool, so the report compares Evergreen's findings with Renovate's for the same repository, by rule family. A maintainer runs Renovate (it needs the network and a large download; it is not part of `npm run check` or any scan). Give it a read-only GitHub token, or it cannot look up GitHub Actions:

```bash
export RENOVATE_TOKEN=<token> GITHUB_COM_TOKEN=<token>
npx renovate --platform=local --dry-run=lookup --report-type=file --report-path=renovate.json
npm run differential:renovate -- --renovate renovate.json --repository . --name owner/repo --out report.json
```

The two tools answer different questions. Renovate says a newer version exists and prints npm deprecation notices; it has no end-of-life data. Evergreen says a release line is past its vendor's end of life; it does not say an update exists. So the report only compares where both can speak about one dependency in one file:

| Family | Evergreen | Renovate | Counted as agreement |
| --- | --- | --- | --- |
| `deprecated-package` | `npm.package.*` findings | npm `deprecationMessage` | both mark the package deprecated |
| `base-image` | `container.*` findings | `dockerfile` / `docker-compose` updates | Renovate offers an update for the image Evergreen calls end-of-life |
| `github-action` | `github-actions.*` findings | `github-actions` updates | Renovate offers an update for the action Evergreen flags |

Outcomes: `agree`, `evergreen-only`, `renovate-only`, and `inconclusive` (Renovate skipped the lookup, for example `github-token-required` for Actions when run without a GitHub token, so it says nothing either way). Runtime findings (`nodejs.runtime.*`, `python.runtime.*`) have no Renovate counterpart and are listed as not comparable. Matching is by file and dependency name because Renovate gives no line numbers.

The committed reports are combined into one reviewable page, [differential-report.md](differential-report.md) (and [differential-report.json](differential-report.json)), which lists every disagreement with links to the declaration at the pinned commit and to each tool's evidence. Regenerate it with `npm run differential:report` after adding or refreshing a report; a test fails when it drifts from the reports.

Results for the five container corpus repositories, with Renovate 44.164 run with a read-only GitHub token on 2026-10-23 (reports in [`benchmarks/differential/reports/`](../benchmarks/differential/reports/), trimmed Renovate output in `tests/fixtures/differential/`):

| Repository | Agree | Evergreen-only | Renovate-only | Inconclusive |
| --- | --- | --- | --- | --- |
| outline/outline | 22 | 5 | 13 | 0 |
| excalidraw/excalidraw | 23 | 2 | 2 | 0 |
| mealie-recipes/mealie | 17 | 0 | 4 | 0 |
| umami-software/umami | 8 | 1 | 0 | 0 |
| gethomepage/homepage | 0 | 0 | 0 | 0 |

What it shows:

- **Agreements** are 10 base images, 53 GitHub Action findings, and 7 npm deprecations. Where Evergreen calls `node` or `postgres` end-of-life, or flags `actions/checkout` on Node 20, Renovate offers a newer major version. Renovate does not say the old line is unsupported; only Evergreen does.
- **No comparison is inconclusive.** With a token Renovate looks up every GitHub Action, so the Action findings that were `inconclusive` in the 2026-10-16 run are now comparisons, and all of them agree.
- **Renovate-only** are npm deprecations Evergreen has no rule for (for example `@types/diff`, `@types/glob`, `@nuxt/types`, `react-waypoint`). This is the real gap: the `npm-deprecated` importer only checks a candidate list, so these names are candidates to add. Each is a Renovate observation, not evidence; the importer still requires the registry's own deprecation notice.
- **Evergreen-only** is not a real disagreement yet. All eight entries are packages Renovate does list, under a different spelling: the comparison reads the package name from the rule id, so `@types/dotenv` becomes `types.dotenv` and `next` with a version-line rule becomes `next.14`. Six of the Renovate-only `@types/*` entries are the same packages seen from the other side. Matching by the rule's package name is a follow-up to this comparison.


## Differential testing against xeol

[xeol](https://github.com/xeol-io/xeol) reports release cycles of products (runtimes, databases, npm packages) that endoflife.date lists as past end of life, for versions it finds in lockfiles and image filesystems. A maintainer runs it (it downloads an EOL database; it is not part of `npm run check` or any scan):

```bash
xeol dir:<checkout> -o json > xeol.json
npm run differential:xeol -- --xeol xeol.json --repository <checkout> --name owner/repo --out report.json
```

The report compares by product, not by file: xeol names the lockfile that resolved a version, Evergreen names the manifest that declares it. Evergreen runtime, container image, and npm package findings are compared with the xeol product of the same name (`node` images with `nodejs`, `golang` with `go`, `postgres` with `postgresql`). Outcomes: `agree` (both report the product), `evergreen-only`, and `xeol-only`. GitHub Actions, CI images, and the other families xeol has no product for are listed as not comparable.

Results for the five repositories of the Renovate comparison, with xeol 0.10.8 run with `dir:` on the pinned checkouts on 2026-10-23 (reports in [`benchmarks/differential/reports/xeol/`](../benchmarks/differential/reports/xeol/), trimmed xeol output in `tests/fixtures/xeol/`):

| Repository | Agree | Evergreen-only | xeol-only |
| --- | --- | --- | --- |
| excalidraw/excalidraw | 0 | 3 | 0 |
| gethomepage/homepage | 0 | 0 | 0 |
| mealie-recipes/mealie | 0 | 2 | 2 |
| outline/outline | 0 | 11 | 0 |
| umami-software/umami | 1 | 4 | 1 |

What the numbers say:

- **Agreement is rare because the tools read different files.** `xeol dir:` resolves versions from lockfiles; it does not read Dockerfiles, workflow files, `.nvmrc`, or `engines`. Every Evergreen runtime and image finding here is therefore Evergreen-only, and not a sign that xeol disagrees. Where both read the same dependency, they agree: both call `next` 13 end of life in umami.
- **xeol-only** are npm packages whose release line endoflife.date lists as ended (`vue` 2.6 and 3.2, `vuetify` 2). Evergreen has no rule for them; each is a candidate for the `npm-support-end` importer, not evidence by itself.
- **Not compared:** GitHub Actions findings, which are the largest Evergreen family in these repositories and which xeol does not model.
## Differential testing against Pluto

[Pluto](https://github.com/FairwindsOps/pluto) reads `apiVersion` and `kind` from manifests and says whether the Kubernetes project still serves them, which is the question the `kubernetes` detector answers. A maintainer runs it (it is not part of `npm run check` or any scan). Run it from inside the checkout, because Pluto joins `--directory` to the working directory:

```bash
(cd <checkout> && pluto detect-files -d . -o json -t k8s=v1.36.0 > pluto.json)
npm run differential:pluto -- --pluto pluto.json --repository <checkout> --name owner/repo --out report.json
```

Findings are compared by file, kind, API group, and version. Outcomes: `agree` (Pluto reports the version as removed at the target version), `evergreen-only`, `pluto-only`, and `pluto-deprecated-only` (deprecated but still served; Evergreen judges only removed versions, so this is not a disagreement). Non-Kubernetes findings are listed as not comparable.

Results for the seventeen Kubernetes corpus repositories, with Pluto 5.24.4 at target `k8s=v1.36.0` on the pinned checkouts on 2026-10-23 (reports in [`benchmarks/differential/reports/pluto/`](../benchmarks/differential/reports/pluto/), trimmed Pluto output in `tests/fixtures/pluto/`; repositories with no Kubernetes finding from either tool are left out of the table):

| Repository | Agree | Evergreen-only | Pluto-only | Pluto deprecated-only |
| --- | --- | --- | --- | --- |
| FairwindsOps/pluto | 1 | 1 | 3 | 0 |
| doitintl/kube-no-trouble | 0 | 0 | 38 | 1 |
| hasura/skor | 0 | 0 | 1 | 0 |
| kelseyhightower/ingress-with-static-ip | 1 | 0 | 0 | 0 |
| kelseyhightower/kubernetes-cluster-federation | 5 | 0 | 0 | 0 |
| knrt10/kubernetes-basicLearning | 1 | 0 | 0 | 0 |
| kubernetes/examples | 10 | 0 | 0 | 0 |
| luksa/kubernetes-in-action | 27 | 0 | 0 | 0 |
| lusyoe/springboot-k8s-example | 1 | 1 | 0 | 0 |
| motiv-labs/janus | 0 | 2 | 0 | 0 |
| ossf/package-analysis | 1 | 0 | 0 | 0 |
| unixhot/salt-kubebin | 15 | 0 | 0 | 0 |
| **Total** | **62** | **4** | **42** | **1** |

Every difference has one of three causes, none of them a wrong finding:

- **Evergreen-only** are Helm templates (`charts/templates/ingress.yaml`, `janus/templates/*.yaml`, a test chart). Pluto cannot parse files with template actions and skips them; Evergreen reads the `apiVersion` and `kind` lines of a template. This is Evergreen finding more.
- **Pluto-only** are `kind: List` items (`hasura/skor`, one Pluto test asset), JSON manifests, and files under `fixtures/` and `testdata/` directories (`doitintl/kube-no-trouble` has 38, `FairwindsOps/pluto` three). The detector page lists these as not judged. Pluto finding more here is the known cost of Evergreen's conservative scope, and the same forms are why the blind repositories were rechecked by hand.
- **Disagreement on a version Evergreen does judge** is zero: all 62 manifests that both tools read agree on removed.

## Accuracy by detector

Precision is true positives over true positives plus false positives; recall is true positives over true positives plus false negatives. Both come from the last full corpus run recorded in [`benchmarks/thresholds.json`](../benchmarks/thresholds.json), so a reader can regenerate every number: run `npm run record:corpus-run`, then `npm run build:coverage`. The table below is generated; a test fails when it drifts from the recorded run. `nodejs` is the Node.js runtime rules served by the npm detector. A dash means the last full run did not score that detector.

<!-- accuracy-tables:start -->
Measured on 145 pinned repositories at commit `122d612` on 2026-10-21. Regenerate with `npm run build:coverage` after `npm run record:corpus-run`.

| Detector | Maturity | True positives | False positives | False negatives | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- |
| android | Experimental | 4 | 0 | 0 | 1.000 | 1.000 |
| ci-images | Experimental | 8 | 0 | 0 | 1.000 | 1.000 |
| container | Experimental | 19 | 0 | 0 | 1.000 | 1.000 |
| cpp | Experimental | 11 | 0 | 0 | 1.000 | 1.000 |
| dart | Experimental | — | — | — | — | — |
| database | Experimental | — | — | — | — | — |
| dotnet | Beta | 105 | 0 | 0 | 1.000 | 1.000 |
| github-actions | Supported | 261 | 0 | 0 | 1.000 | 1.000 |
| go | Experimental | 8 | 0 | 0 | 1.000 | 1.000 |
| java | Beta | 6 | 0 | 0 | 1.000 | 1.000 |
| kubernetes | Beta | 29 | 0 | 0 | 1.000 | 1.000 |
| nodejs | Supported | 44 | 0 | 0 | 1.000 | 1.000 |
| npm | Supported | 49 | 0 | 0 | 1.000 | 1.000 |
| php | Experimental | 5 | 0 | 0 | 1.000 | 1.000 |
| python | Supported | 20 | 0 | 0 | 1.000 | 1.000 |
| ruby | Experimental | 7 | 0 | 0 | 1.000 | 1.000 |
| rust | Experimental | 5 | 0 | 0 | 1.000 | 1.000 |
| serverless | Beta | 20 | 0 | 0 | 1.000 | 1.000 |
| shell | Experimental | — | — | — | — | — |
| swift | Beta | 15 | 0 | 0 | 1.000 | 1.000 |
| terraform | Experimental | — | — | — | — | — |
<!-- accuracy-tables:end -->

## Interpretation and limits

Precision and recall are measured only against Evergreen's documented v0.1 rule set and the pinned corpus. They do not mean Evergreen detects every possible deprecation in these ecosystems. The corpus is public and reproducible, but not a statistically representative sample of all software. Dynamic action references and unsupported ecosystems remain intentionally unclassified.

The controlled source-usage benchmark provides a separate exact-match test for imports, calls, and configuration keys; see [Benchmarks](BENCHMARKS.md).
