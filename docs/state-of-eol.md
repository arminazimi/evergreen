---
title: State of EOL
---

# State of EOL

A citable summary of lifecycle risk in Evergreen's public benchmark corpus: every expected finding at a pinned commit, aggregated by product and release line. The tables below regenerate from the corpus and the last recorded full run; they are a census of that corpus, not a sample of the open-source world.

## Findings

<!-- state-of-eol:start -->
Measured on the public corpus of 457 pinned repositories (2315 expected findings). The last full corpus run was commit `c7b4e14` on 2026-10-24 (456 repositories, precision 1, recall 1). Method: [Validation](VALIDATION.md). Corpus: [`benchmarks/public-repositories.json`](../benchmarks/public-repositories.json). Regenerate with `npm run build:coverage` after `npm run record:corpus-run`.

| Measure | Value |
| --- | ---: |
| Repositories | 457 |
| Expected findings | 2315 |
| Products with findings | 121 |
| Release lines with findings | 171 |

### By product

| Product | Findings | Release lines | Repositories |
| --- | ---: | ---: | ---: |
| actions/checkout | 454 | 1 | 154 |
| nodejs | 320 | 8 | 73 |
| dotnet | 302 | 10 | 19 |
| python | 122 | 2 | 79 |
| actions/setup-python | 106 | 1 | 46 |
| actions/upload-artifact | 90 | 1 | 33 |
| actions/setup-node | 86 | 1 | 39 |
| actions/cache | 71 | 1 | 23 |
| java | 60 | 3 | 13 |
| golang | 52 | 6 | 20 |
| library/node | 31 | 2 | 13 |
| actions/download-artifact | 25 | 1 | 16 |
| ruby | 24 | 5 | 14 |
| softprops/action-gh-release | 22 | 1 | 15 |
| babel-eslint | 19 | 1 | 18 |
| library/python | 19 | 1 | 16 |
| library/ubuntu | 19 | 2 | 9 |
| cmake | 18 | 1 | 13 |
| actions/setup-java | 17 | 1 | 8 |
| next | 17 | 4 | 6 |
| aws-lambda-runtime/nodejs14.x | 16 | 1 | 9 |
| docker/login-action | 16 | 1 | 11 |
| actions/create-github-app-token | 15 | 1 | 2 |
| docker/build-push-action | 15 | 1 | 8 |
| kubernetes/extensions/Deployment | 15 | 1 | 4 |
| @angular/core | 13 | 2 | 2 |
| actions/github-script | 13 | 1 | 8 |
| azure-pipelines/ubuntu-image | 13 | 2 | 7 |
| docker/setup-buildx-action | 13 | 1 | 9 |
| library/postgres | 13 | 2 | 9 |
| powershell | 12 | 4 | 5 |
| kubernetes/extensions/Ingress | 10 | 1 | 6 |
| xcode | 10 | 2 | 10 |
| com.android.billingclient/billing | 9 | 5 | 7 |
| kubernetes/apps/Deployment | 9 | 2 | 2 |
| postgresql | 9 | 3 | 8 |
| aws-lambda-runtime/nodejs12.x | 8 | 1 | 2 |
| aws-lambda-runtime/python3.8 | 8 | 1 | 3 |
| dart | 8 | 1 | 4 |
| library/golang | 8 | 1 | 7 |
| node-sass | 8 | 1 | 8 |
| atty | 7 | 1 | 6 |
| docker/metadata-action | 7 | 1 | 3 |
| docker/setup-qemu-action | 7 | 1 | 6 |
| mysql | 7 | 1 | 4 |
| terraform | 7 | 2 | 5 |
| actions/stale | 6 | 1 | 6 |
| astral-sh/setup-uv | 6 | 1 | 3 |
| ios | 6 | 1 | 2 |
| kubernetes/storage.k8s.io/StorageClass | 6 | 1 | 1 |
| actions/setup-dotnet | 5 | 1 | 4 |
| actions/setup-go | 5 | 1 | 4 |
| ansi_term | 5 | 1 | 5 |
| babel-preset-es2015 | 5 | 1 | 5 |
| kubernetes/batch/CronJob | 5 | 1 | 3 |
| kubernetes/extensions/PodSecurityPolicy | 5 | 1 | 1 |
| library/alpine | 5 | 1 | 4 |
| kubernetes/extensions/DaemonSet | 4 | 1 | 2 |
| library/debian | 4 | 1 | 3 |
| request | 4 | 1 | 4 |
| rollup-plugin-terser | 4 | 1 | 4 |
| django | 3 | 2 | 3 |
| kubernetes/extensions/ReplicaSet | 3 | 1 | 2 |
| library/ruby | 3 | 1 | 2 |
| rollup-plugin-babel | 3 | 1 | 3 |
| rust | 3 | 1 | 2 |
| vue | 3 | 1 | 3 |
| actions/deploy-pages | 2 | 1 | 2 |
| actions/labeler | 2 | 1 | 2 |
| crypto-js | 2 | 1 | 2 |
| hashicorp/setup-terraform | 2 | 1 | 2 |
| istanbul | 2 | 1 | 2 |
| kubernetes/apps/ReplicaSet | 2 | 1 | 1 |
| kubernetes/autoscaling/HorizontalPodAutoscaler | 2 | 2 | 2 |
| kubernetes/policy/PodDisruptionBudget | 2 | 1 | 2 |
| kubernetes/policy/PodSecurityPolicy | 2 | 1 | 1 |
| kubernetes/rbac.authorization.k8s.io/ClusterRoleBinding | 2 | 1 | 1 |
| library/redis | 2 | 1 | 2 |
| php | 2 | 1 | 2 |
| pycrypto | 2 | 1 | 2 |
| scala | 2 | 1 | 1 |
| tempdir | 2 | 1 | 2 |
| tslint | 2 | 1 | 2 |
| uglify-es | 2 | 1 | 2 |
| WindowsAzure.Storage | 2 | 1 | 2 |
| @types/dotenv | 1 | 1 | 1 |
| @types/emoji-regex | 1 | 1 | 1 |
| @types/form-data | 1 | 1 | 1 |
| @types/koa-useragent | 1 | 1 | 1 |
| @types/sanitize-filename | 1 | 1 | 1 |
| @types/socket.io-client | 1 | 1 | 1 |
| actions/configure-pages | 1 | 1 | 1 |
| amazon-eks | 1 | 1 | 1 |
| aws-lambda-runtime/ruby2.7 | 1 | 1 | 1 |
| cloud.google.com/go/pubsub | 1 | 1 | 1 |
| doctrine/cache | 1 | 1 | 1 |
| failure | 1 | 1 | 1 |
| github.com/golang/protobuf | 1 | 1 | 1 |
| google-cloud-functions-runtime/nodejs14 | 1 | 1 | 1 |
| google-cloud-sql-mysql | 1 | 1 | 1 |
| gulp-util | 1 | 1 | 1 |
| helm-repository/stable | 1 | 1 | 1 |
| i18next-parser | 1 | 1 | 1 |
| karma-phantomjs-launcher | 1 | 1 | 1 |
| koa-router | 1 | 1 | 1 |
| kubernetes/apiextensions.k8s.io/CustomResourceDefinition | 1 | 1 | 1 |
| kubernetes/apps/DaemonSet | 1 | 1 | 1 |
| kubernetes/apps/StatefulSet | 1 | 1 | 1 |
| kubernetes/networking.k8s.io/Ingress | 1 | 1 | 1 |
| kubernetes/rbac.authorization.k8s.io/ClusterRole | 1 | 1 | 1 |
| library/mysql | 1 | 1 | 1 |
| lodash.isequal | 1 | 1 | 1 |
| mysql/mysql-connector-java | 1 | 1 | 1 |
| protractor | 1 | 1 | 1 |
| q | 1 | 1 | 1 |
| react-beautiful-dnd | 1 | 1 | 1 |
| request-promise | 1 | 1 | 1 |
| socket.io-redis | 1 | 1 | 1 |
| swiftmailer/swiftmailer | 1 | 1 | 1 |
| typing | 1 | 1 | 1 |
| zendframework/zend-stdlib | 1 | 1 | 1 |

### By product and release line

| Product | Release line | Rule | Event | Findings | Repositories |
| --- | --- | --- | --- | ---: | ---: |
| actions/checkout | Unsupported actions/checkout runtime | [`github-actions.checkout.node20`](rules/github-actions.checkout.node20.html) | end-of-support | 454 | 154 |
| actions/setup-python | Unsupported actions/setup-python runtime | [`github-actions.setup-python.node20`](rules/github-actions.setup-python.node20.html) | end-of-support | 106 | 46 |
| dotnet | .NET 8 reaches end of support on 2026-11-10 | [`dotnet.runtime.end-of-support-8.0`](rules/dotnet.runtime.end-of-support-8.0.html) | scheduled-end-of-life | 103 | 8 |
| nodejs | Node.js 20 is end-of-life | [`nodejs.runtime.eol-20`](rules/nodejs.runtime.eol-20.html) | end-of-life | 102 | 46 |
| python | Python 3.9 and older are end-of-life | [`python.runtime.eol-3.9-and-older`](rules/python.runtime.eol-3.9-and-older.html) | end-of-life | 97 | 68 |
| actions/upload-artifact | Retired actions/upload-artifact release | [`github-actions.upload-artifact.retired`](rules/github-actions.upload-artifact.retired.html) | removed | 90 | 33 |
| actions/setup-node | Unsupported actions/setup-node runtime | [`github-actions.setup-node.node20`](rules/github-actions.setup-node.node20.html) | end-of-support | 86 | 39 |
| nodejs | Legacy Node.js runtime is end-of-life | [`nodejs.runtime.legacy`](rules/nodejs.runtime.legacy.html) | end-of-life | 76 | 40 |
| actions/cache | Unsupported actions/cache runtime | [`github-actions.cache.node20`](rules/github-actions.cache.node20.html) | end-of-support | 71 | 23 |
| nodejs | Node.js 18 is end-of-life | [`nodejs.runtime.eol-18`](rules/nodejs.runtime.eol-18.html) | end-of-life | 60 | 42 |
| dotnet | .NET 9 reaches end of support on 2026-11-10 | [`dotnet.runtime.end-of-support-9.0`](rules/dotnet.runtime.end-of-support-9.0.html) | scheduled-end-of-life | 52 | 4 |
| dotnet | .NET Core 2.0 is no longer supported | [`dotnet.runtime.end-of-support-2.0`](rules/dotnet.runtime.end-of-support-2.0.html) | end-of-support | 48 | 2 |
| nodejs | Node.js 22 reaches end-of-life on 2027-04-30 | [`nodejs.runtime.eol-22`](rules/nodejs.runtime.eol-22.html) | scheduled-end-of-life | 42 | 23 |
| dotnet | .NET 7 is no longer supported | [`dotnet.runtime.end-of-support-7.0`](rules/dotnet.runtime.end-of-support-7.0.html) | end-of-support | 39 | 3 |
| nodejs | Node.js 19 is end-of-life | [`nodejs.runtime.eol-19`](rules/nodejs.runtime.eol-19.html) | end-of-life | 34 | 31 |
| java | Java 18 to 20 are no longer supported | [`java.jdk.end-of-support-18-20`](rules/java.jdk.end-of-support-18-20.html) | end-of-support | 30 | 6 |
| dotnet | .NET Core 3.1 is no longer supported | [`dotnet.runtime.end-of-support-3.1`](rules/dotnet.runtime.end-of-support-3.1.html) | end-of-support | 29 | 7 |
| java | Java 12 to 16 are no longer supported | [`java.jdk.end-of-support-12-16`](rules/java.jdk.end-of-support-12-16.html) | end-of-support | 29 | 6 |
| library/node | Node.js image release lines 21 and older are end-of-life | [`container.node.eol-21-and-older`](rules/container.node.eol-21-and-older.html) | end-of-life | 29 | 12 |
| golang | Go 1.20 and older are no longer supported | [`go.runtime.end-of-support-1.20-and-older`](rules/go.runtime.end-of-support-1.20-and-older.html) | end-of-support | 27 | 7 |
| actions/download-artifact | Retired actions/download-artifact release | [`github-actions.download-artifact.retired`](rules/github-actions.download-artifact.retired.html) | removed | 25 | 16 |
| python | Python 3.10 and older are end-of-life | [`python.runtime.eol-3.10-and-older`](rules/python.runtime.eol-3.10-and-older.html) | end-of-life | 25 | 19 |
| softprops/action-gh-release | Unsupported softprops/action-gh-release runtime | [`github-actions.action-gh-release.node20`](rules/github-actions.action-gh-release.node20.html) | end-of-support | 22 | 15 |
| babel-eslint | babel-eslint is deprecated | [`npm.package.babel-eslint.deprecated`](rules/npm.package.babel-eslint.deprecated.html) | deprecated | 19 | 18 |
| library/python | Python image release lines 3.10 and older are end-of-life | [`container.python.eol-3.10-and-older`](rules/container.python.eol-3.10-and-older.html) | end-of-life | 19 | 16 |
| cmake | CMake policy versions older than 3.5 are removed | [`cpp.cmake.policy-below-3.5.removed`](rules/cpp.cmake.policy-below-3.5.removed.html) | removed | 18 | 13 |
| actions/setup-java | Unsupported actions/setup-java runtime | [`github-actions.setup-java.node20`](rules/github-actions.setup-java.node20.html) | end-of-support | 17 | 8 |
| library/ubuntu | Ubuntu image release lines 20.04 and older are past standard support end-of-life | [`container.ubuntu.eol-20.04-and-older`](rules/container.ubuntu.eol-20.04-and-older.html) | end-of-life | 17 | 7 |
| aws-lambda-runtime/nodejs14.x | AWS Lambda Node.js 14 runtime is end-of-life | [`serverless.aws-lambda.nodejs14.x`](rules/serverless.aws-lambda.nodejs14.x.html) | end-of-life | 16 | 9 |
| docker/login-action | Unsupported docker/login-action runtime | [`github-actions.login-action.node20`](rules/github-actions.login-action.node20.html) | end-of-support | 16 | 11 |
| actions/create-github-app-token | Unsupported actions/create-github-app-token runtime | [`github-actions.create-github-app-token.node20`](rules/github-actions.create-github-app-token.node20.html) | end-of-support | 15 | 2 |
| docker/build-push-action | Unsupported docker/build-push-action runtime | [`github-actions.build-push-action.node20`](rules/github-actions.build-push-action.node20.html) | end-of-support | 15 | 8 |
| kubernetes/extensions/Deployment | Deployment extensions/v1beta1 is no longer served | [`kubernetes.extensions.deployment.v1beta1.removed`](rules/kubernetes.extensions.deployment.v1beta1.removed.html) | removed | 15 | 4 |
| actions/github-script | Unsupported actions/github-script runtime | [`github-actions.github-script.node20`](rules/github-actions.github-script.node20.html) | end-of-support | 13 | 8 |
| docker/setup-buildx-action | Unsupported docker/setup-buildx-action runtime | [`github-actions.setup-buildx-action.node20`](rules/github-actions.setup-buildx-action.node20.html) | end-of-support | 13 | 9 |
| dotnet | .NET 6 is no longer supported | [`dotnet.runtime.end-of-support-6.0`](rules/dotnet.runtime.end-of-support-6.0.html) | end-of-support | 13 | 3 |
| @angular/core | @angular/core v20 reaches end of life on 2026-11-28 | [`npm.package.angular.core.v20.scheduled-end-of-life`](rules/npm.package.angular.core.v20.scheduled-end-of-life.html) | scheduled-end-of-life | 12 | 1 |
| library/postgres | PostgreSQL image major versions 13 and older are end-of-life | [`container.postgres.eol-13-and-older`](rules/container.postgres.eol-13-and-older.html) | end-of-life | 12 | 9 |
| next | Next.js 15 is out of support | [`npm.package.next.15.support-end`](rules/npm.package.next.15.support-end.html) | end-of-support | 11 | 2 |
| dotnet | .NET 5 is no longer supported | [`dotnet.runtime.end-of-support-5.0`](rules/dotnet.runtime.end-of-support-5.0.html) | end-of-support | 10 | 4 |
| kubernetes/extensions/Ingress | Ingress extensions/v1beta1 is no longer served | [`kubernetes.extensions.ingress.v1beta1.removed`](rules/kubernetes.extensions.ingress.v1beta1.removed.html) | removed | 10 | 6 |
| ruby | Ruby 3.1 is end-of-life | [`ruby.runtime.eol-3.1`](rules/ruby.runtime.eol-3.1.html) | end-of-life | 10 | 4 |
| aws-lambda-runtime/nodejs12.x | AWS Lambda Node.js 12 runtime is end-of-life | [`serverless.aws-lambda.nodejs12.x`](rules/serverless.aws-lambda.nodejs12.x.html) | end-of-life | 8 | 2 |
| aws-lambda-runtime/python3.8 | AWS Lambda Python 3.8 runtime is end-of-life | [`serverless.aws-lambda.python3.8`](rules/serverless.aws-lambda.python3.8.html) | end-of-life | 8 | 3 |
| azure-pipelines/ubuntu-image | Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal | [`ci-images.azure-pipelines.ubuntu-22.04`](rules/ci-images.azure-pipelines.ubuntu-22.04.html) | scheduled-end-of-life | 8 | 5 |
| dart | Dart 3.8 no longer receives security updates | [`dart.sdk.end-of-support-3.8`](rules/dart.sdk.end-of-support-3.8.html) | end-of-support | 8 | 4 |
| golang | Go 1.24 is no longer supported | [`go.runtime.end-of-support-1.24`](rules/go.runtime.end-of-support-1.24.html) | end-of-support | 8 | 5 |
| golang | Go 1.25 is no longer supported | [`go.runtime.end-of-support-1.25`](rules/go.runtime.end-of-support-1.25.html) | end-of-support | 8 | 6 |
| kubernetes/apps/Deployment | Deployment apps/v1beta1 is no longer served | [`kubernetes.apps.deployment.v1beta1.removed`](rules/kubernetes.apps.deployment.v1beta1.removed.html) | removed | 8 | 2 |
| library/golang | Go image release lines 1.25 and older are end-of-life | [`container.golang.eol-1.25-and-older`](rules/container.golang.eol-1.25-and-older.html) | end-of-life | 8 | 7 |
| node-sass | Node Sass is end-of-life | [`npm.package.node-sass.eol`](rules/npm.package.node-sass.eol.html) | end-of-life | 8 | 8 |
| atty | atty is no longer maintained | [`rust.crate.atty.unmaintained`](rules/rust.crate.atty.unmaintained.html) | deprecated | 7 | 6 |
| docker/metadata-action | Unsupported docker/metadata-action runtime | [`github-actions.metadata-action.node20`](rules/github-actions.metadata-action.node20.html) | end-of-support | 7 | 3 |
| docker/setup-qemu-action | Unsupported docker/setup-qemu-action runtime | [`github-actions.setup-qemu-action.node20`](rules/github-actions.setup-qemu-action.node20.html) | end-of-support | 7 | 6 |
| mysql | MySQL 5.7 is end-of-life | [`database.mysql.end-of-life-5.7`](rules/database.mysql.end-of-life-5.7.html) | end-of-life | 7 | 4 |
| ruby | Ruby 2.7 is end-of-life | [`ruby.runtime.eol-2.7`](rules/ruby.runtime.eol-2.7.html) | end-of-life | 7 | 4 |
| actions/stale | Unsupported actions/stale runtime | [`github-actions.stale.node20`](rules/github-actions.stale.node20.html) | end-of-support | 6 | 6 |
| astral-sh/setup-uv | Unsupported astral-sh/setup-uv runtime | [`github-actions.setup-uv.node20`](rules/github-actions.setup-uv.node20.html) | end-of-support | 6 | 3 |
| golang | Go 1.22 is no longer supported | [`go.runtime.end-of-support-1.22`](rules/go.runtime.end-of-support-1.22.html) | end-of-support | 6 | 5 |
| ios | iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads | [`swift.app-store.ios-below-13`](rules/swift.app-store.ios-below-13.html) | end-of-support | 6 | 2 |
| kubernetes/storage.k8s.io/StorageClass | StorageClass storage.k8s.io/v1beta1 is no longer served | [`kubernetes.storage-k8s-io.storageclass.v1beta1.removed`](rules/kubernetes.storage-k8s-io.storageclass.v1beta1.removed.html) | removed | 6 | 1 |
| postgresql | PostgreSQL 13 is no longer a supported major version | [`database.postgresql.end-of-life-13`](rules/database.postgresql.end-of-life-13.html) | end-of-life | 6 | 6 |
| powershell | PowerShell 7.2 (LTS) is no longer supported | [`shell.powershell.end-of-life-7.2`](rules/shell.powershell.end-of-life-7.2.html) | end-of-life | 6 | 1 |
| xcode | Xcode older than 15 is not accepted for App Store uploads | [`swift.xcode.app-store-below-15`](rules/swift.xcode.app-store-below-15.html) | end-of-support | 6 | 6 |
| actions/setup-dotnet | Unsupported actions/setup-dotnet runtime | [`github-actions.setup-dotnet.node20`](rules/github-actions.setup-dotnet.node20.html) | end-of-support | 5 | 4 |
| actions/setup-go | Unsupported actions/setup-go runtime | [`github-actions.setup-go.node20`](rules/github-actions.setup-go.node20.html) | end-of-support | 5 | 4 |
| ansi_term | ansi_term is no longer maintained | [`rust.crate.ansi-term.unmaintained`](rules/rust.crate.ansi-term.unmaintained.html) | deprecated | 5 | 5 |
| azure-pipelines/ubuntu-image | Azure Pipelines Ubuntu 20.04 hosted image is retired | [`ci-images.azure-pipelines.ubuntu-20.04`](rules/ci-images.azure-pipelines.ubuntu-20.04.html) | removed | 5 | 4 |
| babel-preset-es2015 | babel-preset-es2015 is deprecated | [`npm.package.babel-preset-es2015.deprecated`](rules/npm.package.babel-preset-es2015.deprecated.html) | deprecated | 5 | 5 |
| com.android.billingclient/billing | Google Play Billing Library 8 reaches its new-app and update deadline on 2027-08-31 | [`android.play-billing.version-8`](rules/android.play-billing.version-8.html) | scheduled-end-of-life | 5 | 3 |
| kubernetes/batch/CronJob | CronJob batch/v1beta1 is no longer served | [`kubernetes.batch.cronjob.v1beta1.removed`](rules/kubernetes.batch.cronjob.v1beta1.removed.html) | removed | 5 | 3 |
| kubernetes/extensions/PodSecurityPolicy | PodSecurityPolicy extensions/v1beta1 is no longer served | [`kubernetes.extensions.podsecuritypolicy.v1beta1.removed`](rules/kubernetes.extensions.podsecuritypolicy.v1beta1.removed.html) | removed | 5 | 1 |
| library/alpine | Alpine Linux image release lines 3.20 and older are end-of-life | [`container.alpine.eol-3.20-and-older`](rules/container.alpine.eol-3.20-and-older.html) | end-of-life | 5 | 4 |
| ruby | Ruby 3.2 is end-of-life | [`ruby.runtime.eol-3.2`](rules/ruby.runtime.eol-3.2.html) | end-of-life | 5 | 5 |
| dotnet | .NET Core 2.1 is no longer supported | [`dotnet.runtime.end-of-support-2.1`](rules/dotnet.runtime.end-of-support-2.1.html) | end-of-support | 4 | 2 |
| kubernetes/extensions/DaemonSet | DaemonSet extensions/v1beta1 is no longer served | [`kubernetes.extensions.daemonset.v1beta1.removed`](rules/kubernetes.extensions.daemonset.v1beta1.removed.html) | removed | 4 | 2 |
| library/debian | Debian image release lines 11 and older are end-of-life | [`container.debian.eol-11-and-older`](rules/container.debian.eol-11-and-older.html) | end-of-life | 4 | 3 |
| next | Next.js 14 is out of support | [`npm.package.next.14.support-end`](rules/npm.package.next.14.support-end.html) | end-of-support | 4 | 3 |
| nodejs | Node.js 25 is end-of-life | [`nodejs.runtime.eol-25`](rules/nodejs.runtime.eol-25.html) | end-of-life | 4 | 2 |
| powershell | PowerShell 7.0 (LTS) is no longer supported | [`shell.powershell.end-of-life-7.0`](rules/shell.powershell.end-of-life-7.0.html) | end-of-life | 4 | 2 |
| request | request is deprecated | [`npm.package.request.deprecated`](rules/npm.package.request.deprecated.html) | deprecated | 4 | 4 |
| rollup-plugin-terser | rollup-plugin-terser is deprecated | [`npm.package.rollup-plugin-terser.deprecated`](rules/npm.package.rollup-plugin-terser.deprecated.html) | deprecated | 4 | 4 |
| terraform | Terraform CLI 1.13 is no longer a supported release line | [`terraform.cli.end-of-support-1.13`](rules/terraform.cli.end-of-support-1.13.html) | end-of-support | 4 | 3 |
| xcode | Xcode 15 through 25 are not accepted for App Store uploads | [`swift.xcode.app-store-15-through-25`](rules/swift.xcode.app-store-15-through-25.html) | end-of-support | 4 | 4 |
| kubernetes/extensions/ReplicaSet | ReplicaSet extensions/v1beta1 is no longer served | [`kubernetes.extensions.replicaset.v1beta1.removed`](rules/kubernetes.extensions.replicaset.v1beta1.removed.html) | removed | 3 | 2 |
| library/ruby | Ruby image release lines 3.2 and older are end-of-life | [`container.ruby.eol-3.2-and-older`](rules/container.ruby.eol-3.2-and-older.html) | end-of-life | 3 | 2 |
| rollup-plugin-babel | rollup-plugin-babel is deprecated | [`npm.package.rollup-plugin-babel.deprecated`](rules/npm.package.rollup-plugin-babel.deprecated.html) | deprecated | 3 | 3 |
| rust | Rust 1.98 and older are no longer supported | [`rust.toolchain.end-of-support-1.98-and-older`](rules/rust.toolchain.end-of-support-1.98-and-older.html) | end-of-support | 3 | 2 |
| terraform | Terraform CLI 1.12 is no longer a supported release line | [`terraform.cli.end-of-support-1.12`](rules/terraform.cli.end-of-support-1.12.html) | end-of-support | 3 | 2 |
| vue | Vue 2 is end-of-life | [`npm.package.vue.eol-2`](rules/npm.package.vue.eol-2.html) | end-of-life | 3 | 3 |
| actions/deploy-pages | Unsupported actions/deploy-pages runtime | [`github-actions.deploy-pages.node20`](rules/github-actions.deploy-pages.node20.html) | end-of-support | 2 | 2 |
| actions/labeler | Unsupported actions/labeler runtime | [`github-actions.labeler.node20`](rules/github-actions.labeler.node20.html) | end-of-support | 2 | 2 |
| crypto-js | crypto-js is deprecated | [`npm.package.crypto-js.deprecated`](rules/npm.package.crypto-js.deprecated.html) | deprecated | 2 | 2 |
| django | Django 4.2 LTS is end-of-life | [`python.package.django-4.2.eol`](rules/python.package.django-4.2.eol.html) | end-of-life | 2 | 2 |
| dotnet | .NET Core 2.2 is no longer supported | [`dotnet.runtime.end-of-support-2.2`](rules/dotnet.runtime.end-of-support-2.2.html) | end-of-support | 2 | 1 |
| dotnet | .NET Core 3.0 is no longer supported | [`dotnet.runtime.end-of-support-3.0`](rules/dotnet.runtime.end-of-support-3.0.html) | end-of-support | 2 | 1 |
| golang | Go 1.23 is no longer supported | [`go.runtime.end-of-support-1.23`](rules/go.runtime.end-of-support-1.23.html) | end-of-support | 2 | 2 |
| hashicorp/setup-terraform | Unsupported hashicorp/setup-terraform runtime | [`github-actions.setup-terraform.node20`](rules/github-actions.setup-terraform.node20.html) | end-of-support | 2 | 2 |
| istanbul | istanbul is deprecated | [`npm.package.istanbul.deprecated`](rules/npm.package.istanbul.deprecated.html) | deprecated | 2 | 2 |
| kubernetes/apps/ReplicaSet | ReplicaSet apps/v1beta2 is no longer served | [`kubernetes.apps.replicaset.v1beta2.removed`](rules/kubernetes.apps.replicaset.v1beta2.removed.html) | removed | 2 | 1 |
| kubernetes/policy/PodDisruptionBudget | PodDisruptionBudget policy/v1beta1 is no longer served | [`kubernetes.policy.poddisruptionbudget.v1beta1.removed`](rules/kubernetes.policy.poddisruptionbudget.v1beta1.removed.html) | removed | 2 | 2 |
| kubernetes/policy/PodSecurityPolicy | PodSecurityPolicy policy/v1beta1 is no longer served | [`kubernetes.policy.podsecuritypolicy.v1beta1.removed`](rules/kubernetes.policy.podsecuritypolicy.v1beta1.removed.html) | removed | 2 | 1 |
| kubernetes/rbac.authorization.k8s.io/ClusterRoleBinding | ClusterRoleBinding rbac.authorization.k8s.io/v1beta1 is no longer served | [`kubernetes.rbac-authorization-k8s-io.clusterrolebinding.v1beta1.removed`](rules/kubernetes.rbac-authorization-k8s-io.clusterrolebinding.v1beta1.removed.html) | removed | 2 | 1 |
| library/node | Node.js image release line 22 reaches end-of-life on 2027-04-30 | [`container.node.eol-22-and-older`](rules/container.node.eol-22-and-older.html) | scheduled-end-of-life | 2 | 1 |
| library/redis | Redis image release lines 6.0 and older are end-of-life | [`container.redis.eol-6.0-and-older`](rules/container.redis.eol-6.0-and-older.html) | end-of-life | 2 | 2 |
| library/ubuntu | Ubuntu image release line 22.04 reaches standard support end-of-life on 2027-06-01 | [`container.ubuntu.eol-22.04`](rules/container.ubuntu.eol-22.04.html) | scheduled-end-of-life | 2 | 2 |
| php | PHP 7.4 is end-of-life | [`php.runtime.eol-7.4`](rules/php.runtime.eol-7.4.html) | end-of-life | 2 | 2 |
| postgresql | PostgreSQL 12 is no longer a supported major version | [`database.postgresql.end-of-life-12`](rules/database.postgresql.end-of-life-12.html) | end-of-life | 2 | 2 |
| pycrypto | PyCrypto is obsolete and vulnerable | [`python.package.pycrypto.obsolete`](rules/python.package.pycrypto.obsolete.html) | end-of-life | 2 | 2 |
| scala | Scala 2.11 reached end of life | [`scala.runtime.eol-2.11`](rules/scala.runtime.eol-2.11.html) | end-of-life | 2 | 1 |
| tempdir | tempdir is no longer maintained | [`rust.crate.tempdir.unmaintained`](rules/rust.crate.tempdir.unmaintained.html) | deprecated | 2 | 2 |
| tslint | tslint is deprecated | [`npm.package.tslint.deprecated`](rules/npm.package.tslint.deprecated.html) | deprecated | 2 | 2 |
| uglify-es | uglify-es is deprecated | [`npm.package.uglify-es.deprecated`](rules/npm.package.uglify-es.deprecated.html) | deprecated | 2 | 2 |
| WindowsAzure.Storage | WindowsAzure.Storage is deprecated on NuGet | [`dotnet.package.windowsazure-storage.deprecated`](rules/dotnet.package.windowsazure-storage.deprecated.html) | deprecated | 2 | 2 |
| @angular/core | @angular/core v18 and older are no longer supported | [`npm.package.angular.core.v18-and-older.end-of-support`](rules/npm.package.angular.core.v18-and-older.end-of-support.html) | end-of-support | 1 | 1 |
| @types/dotenv | @types/dotenv is deprecated | [`npm.package.types.dotenv.deprecated`](rules/npm.package.types.dotenv.deprecated.html) | deprecated | 1 | 1 |
| @types/emoji-regex | @types/emoji-regex is deprecated | [`npm.package.types.emoji-regex.deprecated`](rules/npm.package.types.emoji-regex.deprecated.html) | deprecated | 1 | 1 |
| @types/form-data | @types/form-data is deprecated | [`npm.package.types.form-data.deprecated`](rules/npm.package.types.form-data.deprecated.html) | deprecated | 1 | 1 |
| @types/koa-useragent | @types/koa-useragent is deprecated | [`npm.package.types.koa-useragent.deprecated`](rules/npm.package.types.koa-useragent.deprecated.html) | deprecated | 1 | 1 |
| @types/sanitize-filename | @types/sanitize-filename is deprecated | [`npm.package.types.sanitize-filename.deprecated`](rules/npm.package.types.sanitize-filename.deprecated.html) | deprecated | 1 | 1 |
| @types/socket.io-client | @types/socket.io-client is deprecated | [`npm.package.types.socket.io-client.deprecated`](rules/npm.package.types.socket.io-client.deprecated.html) | deprecated | 1 | 1 |
| actions/configure-pages | Unsupported actions/configure-pages runtime | [`github-actions.configure-pages.node20`](rules/github-actions.configure-pages.node20.html) | end-of-support | 1 | 1 |
| amazon-eks | Amazon EKS 1.30 and earlier are past end of extended support | [`terraform.eks.end-of-life-1.30-and-older`](rules/terraform.eks.end-of-life-1.30-and-older.html) | end-of-life | 1 | 1 |
| aws-lambda-runtime/ruby2.7 | AWS Lambda Ruby 2.7 runtime is end-of-life | [`serverless.aws-lambda.ruby2.7`](rules/serverless.aws-lambda.ruby2.7.html) | end-of-life | 1 | 1 |
| cloud.google.com/go/pubsub | cloud.google.com/go/pubsub is deprecated | [`go.module.cloud.google.com.go.pubsub.deprecated`](rules/go.module.cloud.google.com.go.pubsub.deprecated.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 5 is past its deprecation deadline | [`android.play-billing.version-5`](rules/android.play-billing.version-5.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 6 is past its deprecation deadline | [`android.play-billing.version-6`](rules/android.play-billing.version-6.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 7 is past its deprecation deadline | [`android.play-billing.version-7`](rules/android.play-billing.version-7.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 9 reaches its new-app and update deadline on 2028-08-31 | [`android.play-billing.version-9`](rules/android.play-billing.version-9.html) | scheduled-end-of-life | 1 | 1 |
| django | Django 2.2 LTS is end-of-life | [`python.package.django-2.2.eol`](rules/python.package.django-2.2.eol.html) | end-of-life | 1 | 1 |
| doctrine/cache | doctrine/cache is abandoned | [`php.package.doctrine.cache.abandoned`](rules/php.package.doctrine.cache.abandoned.html) | deprecated | 1 | 1 |
| failure | failure is no longer maintained | [`rust.crate.failure.unmaintained`](rules/rust.crate.failure.unmaintained.html) | deprecated | 1 | 1 |
| github.com/golang/protobuf | github.com/golang/protobuf is deprecated | [`go.module.github.com.golang.protobuf.deprecated`](rules/go.module.github.com.golang.protobuf.deprecated.html) | deprecated | 1 | 1 |
| golang | Go 1.21 is no longer supported | [`go.runtime.end-of-support-1.21`](rules/go.runtime.end-of-support-1.21.html) | end-of-support | 1 | 1 |
| google-cloud-functions-runtime/nodejs14 | Google Cloud Functions Node.js 14 runtime is end-of-life | [`serverless.google-cloud-functions.nodejs14`](rules/serverless.google-cloud-functions.nodejs14.html) | end-of-life | 1 | 1 |
| google-cloud-sql-mysql | Cloud SQL for MySQL 5.6 and 5.7 are in extended support | [`database.google-cloud-sql-mysql.extended-support-5.6-to-5.7`](rules/database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html) | end-of-support | 1 | 1 |
| gulp-util | gulp-util is deprecated | [`npm.package.gulp-util.deprecated`](rules/npm.package.gulp-util.deprecated.html) | deprecated | 1 | 1 |
| helm-repository/stable | Helm stable chart repository is end of life | [`kubernetes.helm.repository.stable.end-of-life`](rules/kubernetes.helm.repository.stable.end-of-life.html) | end-of-life | 1 | 1 |
| i18next-parser | i18next-parser is deprecated | [`npm.package.i18next-parser.deprecated`](rules/npm.package.i18next-parser.deprecated.html) | deprecated | 1 | 1 |
| java | Java 22 to 24 are no longer supported | [`java.jdk.end-of-support-22-24`](rules/java.jdk.end-of-support-22-24.html) | end-of-support | 1 | 1 |
| karma-phantomjs-launcher | karma-phantomjs-launcher is deprecated | [`npm.package.karma-phantomjs-launcher.deprecated`](rules/npm.package.karma-phantomjs-launcher.deprecated.html) | deprecated | 1 | 1 |
| koa-router | koa-router is deprecated | [`npm.package.koa-router.deprecated`](rules/npm.package.koa-router.deprecated.html) | deprecated | 1 | 1 |
| kubernetes/apiextensions.k8s.io/CustomResourceDefinition | CustomResourceDefinition apiextensions.k8s.io/v1beta1 is no longer served | [`kubernetes.apiextensions-k8s-io.customresourcedefinition.v1beta1.removed`](rules/kubernetes.apiextensions-k8s-io.customresourcedefinition.v1beta1.removed.html) | removed | 1 | 1 |
| kubernetes/apps/DaemonSet | DaemonSet apps/v1beta2 is no longer served | [`kubernetes.apps.daemonset.v1beta2.removed`](rules/kubernetes.apps.daemonset.v1beta2.removed.html) | removed | 1 | 1 |
| kubernetes/apps/Deployment | Deployment apps/v1beta2 is no longer served | [`kubernetes.apps.deployment.v1beta2.removed`](rules/kubernetes.apps.deployment.v1beta2.removed.html) | removed | 1 | 1 |
| kubernetes/apps/StatefulSet | StatefulSet apps/v1beta1 is no longer served | [`kubernetes.apps.statefulset.v1beta1.removed`](rules/kubernetes.apps.statefulset.v1beta1.removed.html) | removed | 1 | 1 |
| kubernetes/autoscaling/HorizontalPodAutoscaler | HorizontalPodAutoscaler autoscaling/v2beta1 is no longer served | [`kubernetes.autoscaling.horizontalpodautoscaler.v2beta1.removed`](rules/kubernetes.autoscaling.horizontalpodautoscaler.v2beta1.removed.html) | removed | 1 | 1 |
| kubernetes/autoscaling/HorizontalPodAutoscaler | HorizontalPodAutoscaler autoscaling/v2beta2 is no longer served | [`kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed`](rules/kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed.html) | removed | 1 | 1 |
| kubernetes/networking.k8s.io/Ingress | Ingress networking.k8s.io/v1beta1 is no longer served | [`kubernetes.networking-k8s-io.ingress.v1beta1.removed`](rules/kubernetes.networking-k8s-io.ingress.v1beta1.removed.html) | removed | 1 | 1 |
| kubernetes/rbac.authorization.k8s.io/ClusterRole | ClusterRole rbac.authorization.k8s.io/v1beta1 is no longer served | [`kubernetes.rbac-authorization-k8s-io.clusterrole.v1beta1.removed`](rules/kubernetes.rbac-authorization-k8s-io.clusterrole.v1beta1.removed.html) | removed | 1 | 1 |
| library/mysql | MySQL image release lines 8.0 and older are past end-of-life | [`container.mysql.eol-8.0-and-older`](rules/container.mysql.eol-8.0-and-older.html) | end-of-life | 1 | 1 |
| library/postgres | PostgreSQL image release line 14 reaches end-of-life on 2026-11-12 | [`container.postgres.eol-14-and-older`](rules/container.postgres.eol-14-and-older.html) | scheduled-end-of-life | 1 | 1 |
| lodash.isequal | lodash.isequal is deprecated | [`npm.package.lodash-isequal.deprecated`](rules/npm.package.lodash-isequal.deprecated.html) | deprecated | 1 | 1 |
| mysql/mysql-connector-java | mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j | [`java.maven.mysql.mysql-connector-java.relocated`](rules/java.maven.mysql.mysql-connector-java.relocated.html) | deprecated | 1 | 1 |
| next | Next.js 12 is out of support | [`npm.package.next.12.support-end`](rules/npm.package.next.12.support-end.html) | end-of-support | 1 | 1 |
| next | Next.js 13 is out of support | [`npm.package.next.13.support-end`](rules/npm.package.next.13.support-end.html) | end-of-support | 1 | 1 |
| nodejs | Node.js 21 is end-of-life | [`nodejs.runtime.eol-21`](rules/nodejs.runtime.eol-21.html) | end-of-life | 1 | 1 |
| nodejs | Node.js 23 is end-of-life | [`nodejs.runtime.eol-23`](rules/nodejs.runtime.eol-23.html) | end-of-life | 1 | 1 |
| postgresql | PostgreSQL 11 is no longer a supported major version | [`database.postgresql.end-of-life-11`](rules/database.postgresql.end-of-life-11.html) | end-of-life | 1 | 1 |
| powershell | PowerShell 6.x is no longer supported | [`shell.powershell.end-of-life-6`](rules/shell.powershell.end-of-life-6.html) | end-of-life | 1 | 1 |
| powershell | PowerShell 7.1 is no longer supported | [`shell.powershell.end-of-life-7.1`](rules/shell.powershell.end-of-life-7.1.html) | end-of-life | 1 | 1 |
| protractor | Protractor is deprecated | [`npm.package.protractor.deprecated`](rules/npm.package.protractor.deprecated.html) | deprecated | 1 | 1 |
| q | q is deprecated | [`npm.package.q.deprecated`](rules/npm.package.q.deprecated.html) | deprecated | 1 | 1 |
| react-beautiful-dnd | react-beautiful-dnd is deprecated | [`npm.package.react-beautiful-dnd.deprecated`](rules/npm.package.react-beautiful-dnd.deprecated.html) | deprecated | 1 | 1 |
| request-promise | request-promise is deprecated | [`npm.package.request-promise.deprecated`](rules/npm.package.request-promise.deprecated.html) | deprecated | 1 | 1 |
| ruby | Ruby 2.6 is end-of-life | [`ruby.runtime.eol-2.6`](rules/ruby.runtime.eol-2.6.html) | end-of-life | 1 | 1 |
| ruby | Ruby 3.0 is end-of-life | [`ruby.runtime.eol-3.0`](rules/ruby.runtime.eol-3.0.html) | end-of-life | 1 | 1 |
| socket.io-redis | socket.io-redis is deprecated | [`npm.package.socket.io-redis.deprecated`](rules/npm.package.socket.io-redis.deprecated.html) | deprecated | 1 | 1 |
| swiftmailer/swiftmailer | swiftmailer/swiftmailer is abandoned | [`php.package.swiftmailer.swiftmailer.abandoned`](rules/php.package.swiftmailer.swiftmailer.abandoned.html) | deprecated | 1 | 1 |
| typing | typing is archived on PyPI | [`python.package.typing.archived`](rules/python.package.typing.archived.html) | end-of-life | 1 | 1 |
| zendframework/zend-stdlib | zendframework/zend-stdlib is abandoned | [`php.package.zendframework.zend-stdlib.abandoned`](rules/php.package.zendframework.zend-stdlib.abandoned.html) | deprecated | 1 | 1 |
<!-- state-of-eol:end -->

## Limits

Counts come from expected findings in `benchmarks/public-repositories.json`, joined to bundled rules in `registry/`. Scans never use the network. A product with no corpus finding does not appear here.
