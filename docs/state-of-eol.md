---
title: State of EOL
---

# State of EOL

A citable summary of lifecycle risk in Evergreen's public benchmark corpus: every expected finding at a pinned commit, aggregated by product and release line. The tables below regenerate from the corpus and the last recorded full run; they are a census of that corpus, not a sample of the open-source world.

## Findings

<!-- state-of-eol:start -->
Measured on the public corpus of 1512 pinned repositories (9774 expected findings). The last full corpus run was commit `dcc9f320` on 2026-11-06 (557 repositories, precision 1, recall 1). Method: [Validation](VALIDATION.md). Corpus: [`benchmarks/public-repositories/`](../benchmarks/public-repositories/). Regenerate with `npm run build:coverage` after `npm run record:corpus-run`.

| Measure | Value |
| --- | ---: |
| Repositories | 1512 |
| Expected findings | 9774 |
| Products with findings | 163 |
| Release lines with findings | 235 |

### By product

| Product | Findings | Release lines | Repositories |
| --- | ---: | ---: | ---: |
| actions/checkout | 2030 | 1 | 539 |
| dockerfile | 842 | 2 | 59 |
| nodejs | 773 | 8 | 196 |
| dotnet | 587 | 10 | 65 |
| terraform | 482 | 4 | 15 |
| actions/upload-artifact | 473 | 1 | 160 |
| actions/setup-node | 298 | 1 | 116 |
| actions/setup-python | 276 | 1 | 115 |
| cmake | 276 | 2 | 30 |
| actions/cache | 268 | 1 | 96 |
| ruby | 267 | 11 | 63 |
| python | 216 | 2 | 136 |
| actions/download-artifact | 185 | 1 | 86 |
| actions/setup-java | 160 | 1 | 70 |
| dart | 138 | 3 | 31 |
| golang | 137 | 6 | 65 |
| powershell | 105 | 5 | 31 |
| softprops/action-gh-release | 102 | 1 | 68 |
| docker/build-push-action | 94 | 1 | 47 |
| docker/login-action | 93 | 1 | 56 |
| library/node | 89 | 2 | 44 |
| library/ubuntu | 82 | 2 | 38 |
| android/targetSdk | 80 | 1 | 38 |
| github-actions/set-output | 79 | 1 | 28 |
| aws-lambda-runtime/nodejs24.x | 74 | 1 | 1 |
| docker/setup-buildx-action | 72 | 1 | 41 |
| java | 70 | 3 | 20 |
| actions/setup-go | 68 | 1 | 22 |
| rust | 65 | 1 | 59 |
| xcode | 52 | 2 | 52 |
| erlang | 49 | 2 | 29 |
| library/alpine | 48 | 1 | 19 |
| library/python | 48 | 2 | 35 |
| sbt | 47 | 1 | 41 |
| actions/github-script | 45 | 1 | 22 |
| azure-pipelines/ubuntu-image | 45 | 2 | 23 |
| docker/setup-qemu-action | 35 | 1 | 25 |
| docker/metadata-action | 30 | 1 | 21 |
| scala | 30 | 2 | 27 |
| library/debian | 29 | 1 | 14 |
| library/golang | 29 | 1 | 17 |
| actions/setup-dotnet | 26 | 1 | 12 |
| babel-eslint | 26 | 1 | 25 |
| kubernetes/extensions/Deployment | 25 | 1 | 7 |
| atty | 24 | 1 | 23 |
| elixir | 24 | 2 | 24 |
| node-sass | 24 | 2 | 12 |
| php | 24 | 2 | 17 |
| ios | 23 | 1 | 8 |
| actions/deploy-pages | 22 | 1 | 22 |
| aws-lambda-runtime/python3.14 | 21 | 1 | 1 |
| library/postgres | 21 | 2 | 14 |
| next | 20 | 4 | 9 |
| astral-sh/setup-uv | 19 | 1 | 10 |
| postgresql | 18 | 5 | 14 |
| actions/create-github-app-token | 17 | 1 | 3 |
| actions/stale | 17 | 1 | 16 |
| @angular/core | 16 | 3 | 5 |
| aws-lambda-runtime/nodejs14.x | 16 | 1 | 9 |
| azure-pipelines/windows-image | 16 | 1 | 8 |
| kubernetes/extensions/Ingress | 16 | 1 | 10 |
| tempdir | 16 | 1 | 12 |
| swiftmailer/swiftmailer | 15 | 1 | 14 |
| ansi_term | 14 | 1 | 14 |
| doctrine/cache | 14 | 1 | 12 |
| fzaninotto/faker | 14 | 1 | 8 |
| rails | 14 | 1 | 1 |
| aws-lambda-runtime/provided.al2023 | 12 | 1 | 3 |
| failure | 12 | 1 | 6 |
| library/ruby | 12 | 1 | 9 |
| github.com/golang/protobuf | 10 | 1 | 4 |
| vue | 10 | 1 | 10 |
| aws-lambda-runtime/nodejs12.x | 9 | 1 | 3 |
| babel-preset-es2015 | 9 | 1 | 9 |
| com.android.billingclient/billing | 9 | 5 | 7 |
| kubernetes/apps/Deployment | 9 | 2 | 2 |
| mysql | 9 | 1 | 6 |
| actions/configure-pages | 8 | 1 | 8 |
| aws-lambda-runtime/python3.8 | 8 | 1 | 3 |
| aws-lambda-runtime/ruby4.0 | 8 | 1 | 1 |
| kubernetes/storage.k8s.io/StorageClass | 8 | 1 | 2 |
| aws-lambda-runtime/nodejs22.x | 7 | 1 | 3 |
| kubernetes/apiextensions.k8s.io/CustomResourceDefinition | 6 | 1 | 3 |
| kubernetes/batch/CronJob | 5 | 1 | 3 |
| kubernetes/extensions/PodSecurityPolicy | 5 | 1 | 1 |
| library/redis | 5 | 1 | 3 |
| react-native | 5 | 1 | 3 |
| rollup-plugin-terser | 5 | 1 | 5 |
| django | 4 | 2 | 4 |
| istanbul | 4 | 1 | 4 |
| kubernetes/extensions/DaemonSet | 4 | 1 | 2 |
| kubernetes/rbac.authorization.k8s.io/ClusterRoleBinding | 4 | 1 | 3 |
| library/mysql | 4 | 1 | 4 |
| request | 4 | 1 | 4 |
| tslint | 4 | 1 | 4 |
| WindowsAzure.Storage | 4 | 1 | 4 |
| actions/first-interaction | 3 | 1 | 3 |
| actions/labeler | 3 | 1 | 3 |
| aws-lambda-runtime/provided.al2 | 3 | 1 | 2 |
| azure-pipelines/macos-image | 3 | 1 | 3 |
| kubernetes/extensions/ReplicaSet | 3 | 1 | 2 |
| popper.js | 3 | 1 | 3 |
| redis | 3 | 1 | 3 |
| rollup-plugin-babel | 3 | 1 | 3 |
| aws-lambda-runtime/nodejs16.x | 2 | 1 | 1 |
| aws-lambda-runtime/nodejs20.x | 2 | 1 | 1 |
| crypto-js | 2 | 1 | 2 |
| github-actions/add-path | 2 | 1 | 1 |
| github-actions/set-env | 2 | 1 | 1 |
| hashicorp/setup-terraform | 2 | 1 | 2 |
| karma-phantomjs-launcher | 2 | 1 | 2 |
| kubernetes/apps/ReplicaSet | 2 | 1 | 1 |
| kubernetes/apps/StatefulSet | 2 | 1 | 2 |
| kubernetes/autoscaling/HorizontalPodAutoscaler | 2 | 2 | 2 |
| kubernetes/policy/PodDisruptionBudget | 2 | 1 | 2 |
| kubernetes/policy/PodSecurityPolicy | 2 | 1 | 1 |
| laravel/framework | 2 | 1 | 1 |
| protractor | 2 | 1 | 2 |
| pycrypto | 2 | 1 | 2 |
| request-promise | 2 | 1 | 2 |
| sensiolabs/security-checker | 2 | 1 | 1 |
| uglify-es | 2 | 1 | 2 |
| @types/dotenv | 1 | 1 | 1 |
| @types/emoji-regex | 1 | 1 | 1 |
| @types/form-data | 1 | 1 | 1 |
| @types/koa-useragent | 1 | 1 | 1 |
| @types/sanitize-filename | 1 | 1 | 1 |
| @types/socket.io-client | 1 | 1 | 1 |
| amazon-eks | 1 | 1 | 1 |
| aws-lambda-runtime/dotnet10 | 1 | 1 | 1 |
| aws-lambda-runtime/java25 | 1 | 1 | 1 |
| aws-lambda-runtime/nodejs10.x | 1 | 1 | 1 |
| aws-lambda-runtime/nodejs18.x | 1 | 1 | 1 |
| aws-lambda-runtime/python3.13 | 1 | 1 | 1 |
| aws-lambda-runtime/ruby2.7 | 1 | 1 | 1 |
| bun | 1 | 1 | 1 |
| cloud.google.com/go/pubsub | 1 | 1 | 1 |
| deno | 1 | 1 | 1 |
| domexception | 1 | 1 | 1 |
| google-cloud-functions-runtime/nodejs14 | 1 | 1 | 1 |
| google-cloud-functions-runtime/nodejs20 | 1 | 1 | 1 |
| google-cloud-functions-runtime/python37 | 1 | 1 | 1 |
| google-cloud-sql-mysql | 1 | 1 | 1 |
| gulp-util | 1 | 1 | 1 |
| helm-repository/stable | 1 | 1 | 1 |
| i18next-parser | 1 | 1 | 1 |
| koa-router | 1 | 1 | 1 |
| kubernetes/admissionregistration.k8s.io/MutatingWebhookConfiguration | 1 | 1 | 1 |
| kubernetes/admissionregistration.k8s.io/ValidatingWebhookConfiguration | 1 | 1 | 1 |
| kubernetes/apps/DaemonSet | 1 | 1 | 1 |
| kubernetes/networking.k8s.io/Ingress | 1 | 1 | 1 |
| kubernetes/rbac.authorization.k8s.io/ClusterRole | 1 | 1 | 1 |
| library/zookeeper | 1 | 1 | 1 |
| lodash.isequal | 1 | 1 | 1 |
| mysql/mysql-connector-java | 1 | 1 | 1 |
| natives | 1 | 1 | 1 |
| nose | 1 | 1 | 1 |
| pytest-runner | 1 | 1 | 1 |
| q | 1 | 1 | 1 |
| react-beautiful-dnd | 1 | 1 | 1 |
| socket.io-redis | 1 | 1 | 1 |
| typing | 1 | 1 | 1 |
| zendframework/zend-stdlib | 1 | 1 | 1 |

### By product and release line

| Product | Release line | Rule | Event | Findings | Repositories |
| --- | --- | --- | --- | ---: | ---: |
| actions/checkout | Unsupported actions/checkout runtime | [`github-actions.checkout.node20`](rules/github-actions.checkout.node20.html) | end-of-support | 2030 | 539 |
| dockerfile | The Dockerfile legacy "ENV key value" form is deprecated | [`container.dockerfile.legacy-env-format`](rules/container.dockerfile.legacy-env-format.html) | deprecated | 819 | 53 |
| actions/upload-artifact | Retired actions/upload-artifact release | [`github-actions.upload-artifact.retired`](rules/github-actions.upload-artifact.retired.html) | removed | 473 | 160 |
| terraform | Interpolation-only strings are deprecated | [`terraform.syntax.interpolation-only`](rules/terraform.syntax.interpolation-only.html) | deprecated | 402 | 10 |
| actions/setup-node | Unsupported actions/setup-node runtime | [`github-actions.setup-node.node20`](rules/github-actions.setup-node.node20.html) | end-of-support | 298 | 116 |
| actions/setup-python | Unsupported actions/setup-python runtime | [`github-actions.setup-python.node20`](rules/github-actions.setup-python.node20.html) | end-of-support | 276 | 115 |
| actions/cache | Unsupported actions/cache runtime | [`github-actions.cache.node20`](rules/github-actions.cache.node20.html) | end-of-support | 268 | 96 |
| cmake | CMake policy versions older than 3.5 are removed | [`cpp.cmake.policy-below-3.5.removed`](rules/cpp.cmake.policy-below-3.5.removed.html) | removed | 260 | 29 |
| nodejs | Node.js 20 is end-of-life | [`nodejs.runtime.eol-20`](rules/nodejs.runtime.eol-20.html) | end-of-life | 221 | 106 |
| dotnet | .NET 8 reaches end of support on 2026-11-10 | [`dotnet.runtime.end-of-support-8.0`](rules/dotnet.runtime.end-of-support-8.0.html) | scheduled-end-of-life | 203 | 27 |
| nodejs | Node.js 22 reaches end-of-life on 2027-04-30 | [`nodejs.runtime.eol-22`](rules/nodejs.runtime.eol-22.html) | scheduled-end-of-life | 197 | 85 |
| actions/download-artifact | Retired actions/download-artifact release | [`github-actions.download-artifact.retired`](rules/github-actions.download-artifact.retired.html) | removed | 185 | 86 |
| actions/setup-java | Unsupported actions/setup-java runtime | [`github-actions.setup-java.node20`](rules/github-actions.setup-java.node20.html) | end-of-support | 160 | 70 |
| python | Python 3.9 and older are end-of-life | [`python.runtime.eol-3.9-and-older`](rules/python.runtime.eol-3.9-and-older.html) | end-of-life | 158 | 108 |
| nodejs | Legacy Node.js runtime is end-of-life | [`nodejs.runtime.legacy`](rules/nodejs.runtime.legacy.html) | end-of-life | 130 | 69 |
| dart | Dart 2 and older no longer receive security updates | [`dart.sdk.end-of-support-2-and-older`](rules/dart.sdk.end-of-support-2-and-older.html) | end-of-support | 129 | 26 |
| nodejs | Node.js 18 is end-of-life | [`nodejs.runtime.eol-18`](rules/nodejs.runtime.eol-18.html) | end-of-life | 124 | 78 |
| ruby | Ruby 2.7 is end-of-life | [`ruby.runtime.eol-2.7`](rules/ruby.runtime.eol-2.7.html) | end-of-life | 105 | 21 |
| softprops/action-gh-release | Unsupported softprops/action-gh-release runtime | [`github-actions.action-gh-release.node20`](rules/github-actions.action-gh-release.node20.html) | end-of-support | 102 | 68 |
| docker/build-push-action | Unsupported docker/build-push-action runtime | [`github-actions.build-push-action.node20`](rules/github-actions.build-push-action.node20.html) | end-of-support | 94 | 47 |
| docker/login-action | Unsupported docker/login-action runtime | [`github-actions.login-action.node20`](rules/github-actions.login-action.node20.html) | end-of-support | 93 | 56 |
| nodejs | Node.js 19 is end-of-life | [`nodejs.runtime.eol-19`](rules/nodejs.runtime.eol-19.html) | end-of-life | 83 | 60 |
| android/targetSdk | Google Play requires targetSdk 35+ for existing phone and tablet apps | [`android.target-sdk.existing.default-below-35`](rules/android.target-sdk.existing.default-below-35.html) | end-of-support | 80 | 38 |
| github-actions/set-output | Deprecated GitHub Actions ::set-output command | [`github-actions.workflow-command.set-output`](rules/github-actions.workflow-command.set-output.html) | deprecated | 79 | 28 |
| ruby | Ruby 3.2 is end-of-life | [`ruby.runtime.eol-3.2`](rules/ruby.runtime.eol-3.2.html) | end-of-life | 77 | 15 |
| aws-lambda-runtime/nodejs24.x | AWS Lambda Node.js 24 runtime reaches end of life on 2028-04-30 | [`serverless.aws-lambda.nodejs24.x`](rules/serverless.aws-lambda.nodejs24.x.html) | scheduled-end-of-life | 74 | 1 |
| dotnet | .NET 7 is no longer supported | [`dotnet.runtime.end-of-support-7.0`](rules/dotnet.runtime.end-of-support-7.0.html) | end-of-support | 74 | 11 |
| golang | Go 1.20 and older are no longer supported | [`go.runtime.end-of-support-1.20-and-older`](rules/go.runtime.end-of-support-1.20-and-older.html) | end-of-support | 73 | 41 |
| terraform | The list() and map() functions were removed in Terraform 0.15 | [`terraform.function.list-map`](rules/terraform.function.list-map.html) | removed | 73 | 1 |
| docker/setup-buildx-action | Unsupported docker/setup-buildx-action runtime | [`github-actions.setup-buildx-action.node20`](rules/github-actions.setup-buildx-action.node20.html) | end-of-support | 72 | 41 |
| dotnet | .NET 9 reaches end of support on 2026-11-10 | [`dotnet.runtime.end-of-support-9.0`](rules/dotnet.runtime.end-of-support-9.0.html) | scheduled-end-of-life | 72 | 8 |
| library/node | Node.js image release lines 21 and older are end-of-life | [`container.node.eol-21-and-older`](rules/container.node.eol-21-and-older.html) | end-of-life | 69 | 32 |
| actions/setup-go | Unsupported actions/setup-go runtime | [`github-actions.setup-go.node20`](rules/github-actions.setup-go.node20.html) | end-of-support | 68 | 22 |
| dotnet | .NET Core 3.1 is no longer supported | [`dotnet.runtime.end-of-support-3.1`](rules/dotnet.runtime.end-of-support-3.1.html) | end-of-support | 65 | 17 |
| library/ubuntu | Ubuntu image release lines 20.04 and older are past standard support end-of-life | [`container.ubuntu.eol-20.04-and-older`](rules/container.ubuntu.eol-20.04-and-older.html) | end-of-life | 65 | 30 |
| rust | Rust 1.98 and older are no longer supported | [`rust.toolchain.end-of-support-1.98-and-older`](rules/rust.toolchain.end-of-support-1.98-and-older.html) | end-of-support | 65 | 59 |
| python | Python 3.10 and older are end-of-life | [`python.runtime.eol-3.10-and-older`](rules/python.runtime.eol-3.10-and-older.html) | end-of-life | 58 | 46 |
| powershell | PowerShell 7.0 (LTS) is no longer supported | [`shell.powershell.end-of-life-7.0`](rules/shell.powershell.end-of-life-7.0.html) | end-of-life | 53 | 11 |
| dotnet | .NET Core 2.0 is no longer supported | [`dotnet.runtime.end-of-support-2.0`](rules/dotnet.runtime.end-of-support-2.0.html) | end-of-support | 50 | 4 |
| dotnet | .NET 5 is no longer supported | [`dotnet.runtime.end-of-support-5.0`](rules/dotnet.runtime.end-of-support-5.0.html) | end-of-support | 50 | 14 |
| dotnet | .NET 6 is no longer supported | [`dotnet.runtime.end-of-support-6.0`](rules/dotnet.runtime.end-of-support-6.0.html) | end-of-support | 50 | 16 |
| library/alpine | Alpine Linux image release lines 3.20 and older are end-of-life | [`container.alpine.eol-3.20-and-older`](rules/container.alpine.eol-3.20-and-older.html) | end-of-life | 48 | 19 |
| sbt | sbt 0.13 reached end of life | [`scala.sbt.eol-0.13`](rules/scala.sbt.eol-0.13.html) | end-of-life | 47 | 41 |
| actions/github-script | Unsupported actions/github-script runtime | [`github-actions.github-script.node20`](rules/github-actions.github-script.node20.html) | end-of-support | 45 | 22 |
| library/python | Python image release lines 3.10 and older are end-of-life | [`container.python.eol-3.10-and-older`](rules/container.python.eol-3.10-and-older.html) | end-of-life | 40 | 30 |
| docker/setup-qemu-action | Unsupported docker/setup-qemu-action runtime | [`github-actions.setup-qemu-action.node20`](rules/github-actions.setup-qemu-action.node20.html) | end-of-support | 35 | 25 |
| java | Java 18 to 20 are no longer supported | [`java.jdk.end-of-support-18-20`](rules/java.jdk.end-of-support-18-20.html) | end-of-support | 34 | 8 |
| java | Java 12 to 16 are no longer supported | [`java.jdk.end-of-support-12-16`](rules/java.jdk.end-of-support-12-16.html) | end-of-support | 32 | 8 |
| docker/metadata-action | Unsupported docker/metadata-action runtime | [`github-actions.metadata-action.node20`](rules/github-actions.metadata-action.node20.html) | end-of-support | 30 | 21 |
| powershell | PowerShell 7.2 (LTS) is no longer supported | [`shell.powershell.end-of-life-7.2`](rules/shell.powershell.end-of-life-7.2.html) | end-of-life | 30 | 10 |
| library/debian | Debian image release lines 11 and older are end-of-life | [`container.debian.eol-11-and-older`](rules/container.debian.eol-11-and-older.html) | end-of-life | 29 | 14 |
| library/golang | Go image release lines 1.25 and older are end-of-life | [`container.golang.eol-1.25-and-older`](rules/container.golang.eol-1.25-and-older.html) | end-of-life | 29 | 17 |
| ruby | Ruby 3.1 is end-of-life | [`ruby.runtime.eol-3.1`](rules/ruby.runtime.eol-3.1.html) | end-of-life | 29 | 12 |
| xcode | Xcode 15 through 25 are not accepted for App Store uploads | [`swift.xcode.app-store-15-through-25`](rules/swift.xcode.app-store-15-through-25.html) | end-of-support | 29 | 29 |
| scala | Scala 2.11 reached end of life | [`scala.runtime.eol-2.11`](rules/scala.runtime.eol-2.11.html) | end-of-life | 28 | 25 |
| actions/setup-dotnet | Unsupported actions/setup-dotnet runtime | [`github-actions.setup-dotnet.node20`](rules/github-actions.setup-dotnet.node20.html) | end-of-support | 26 | 12 |
| azure-pipelines/ubuntu-image | Azure Pipelines Ubuntu 20.04 hosted image is retired | [`ci-images.azure-pipelines.ubuntu-20.04`](rules/ci-images.azure-pipelines.ubuntu-20.04.html) | removed | 26 | 15 |
| babel-eslint | babel-eslint is deprecated | [`npm.package.babel-eslint.deprecated`](rules/npm.package.babel-eslint.deprecated.html) | deprecated | 26 | 25 |
| erlang | Erlang/OTP 25 no longer receives security updates | [`elixir.erlang.eol-25`](rules/elixir.erlang.eol-25.html) | end-of-life | 26 | 16 |
| kubernetes/extensions/Deployment | Deployment extensions/v1beta1 is no longer served | [`kubernetes.extensions.deployment.v1beta1.removed`](rules/kubernetes.extensions.deployment.v1beta1.removed.html) | removed | 25 | 7 |
| atty | atty is no longer maintained | [`rust.crate.atty.unmaintained`](rules/rust.crate.atty.unmaintained.html) | deprecated | 24 | 23 |
| dockerfile | The Dockerfile MAINTAINER instruction is deprecated | [`container.dockerfile.maintainer`](rules/container.dockerfile.maintainer.html) | deprecated | 23 | 13 |
| erlang | Erlang/OTP 26 no longer receives security updates | [`elixir.erlang.eol-26`](rules/elixir.erlang.eol-26.html) | end-of-life | 23 | 13 |
| ios | iOS and iPadOS app targets below iOS 13 are not accepted for App Store uploads | [`swift.app-store.ios-below-13`](rules/swift.app-store.ios-below-13.html) | end-of-support | 23 | 8 |
| php | PHP 7.4 is end-of-life | [`php.runtime.eol-7.4`](rules/php.runtime.eol-7.4.html) | end-of-life | 23 | 16 |
| xcode | Xcode older than 15 is not accepted for App Store uploads | [`swift.xcode.app-store-below-15`](rules/swift.xcode.app-store-below-15.html) | end-of-support | 23 | 23 |
| actions/deploy-pages | Unsupported actions/deploy-pages runtime | [`github-actions.deploy-pages.node20`](rules/github-actions.deploy-pages.node20.html) | end-of-support | 22 | 22 |
| golang | Go 1.24 is no longer supported | [`go.runtime.end-of-support-1.24`](rules/go.runtime.end-of-support-1.24.html) | end-of-support | 22 | 8 |
| aws-lambda-runtime/python3.14 | AWS Lambda Python 3.14 runtime reaches end of life on 2029-06-30 | [`serverless.aws-lambda.python3.14`](rules/serverless.aws-lambda.python3.14.html) | scheduled-end-of-life | 21 | 1 |
| library/node | Node.js image release line 22 reaches end-of-life on 2027-04-30 | [`container.node.eol-22-and-older`](rules/container.node.eol-22-and-older.html) | scheduled-end-of-life | 20 | 12 |
| astral-sh/setup-uv | Unsupported astral-sh/setup-uv runtime | [`github-actions.setup-uv.node20`](rules/github-actions.setup-uv.node20.html) | end-of-support | 19 | 10 |
| azure-pipelines/ubuntu-image | Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal | [`ci-images.azure-pipelines.ubuntu-22.04`](rules/ci-images.azure-pipelines.ubuntu-22.04.html) | scheduled-end-of-life | 19 | 10 |
| golang | Go 1.25 is no longer supported | [`go.runtime.end-of-support-1.25`](rules/go.runtime.end-of-support-1.25.html) | end-of-support | 19 | 12 |
| actions/create-github-app-token | Unsupported actions/create-github-app-token runtime | [`github-actions.create-github-app-token.node20`](rules/github-actions.create-github-app-token.node20.html) | end-of-support | 17 | 3 |
| actions/stale | Unsupported actions/stale runtime | [`github-actions.stale.node20`](rules/github-actions.stale.node20.html) | end-of-support | 17 | 16 |
| library/postgres | PostgreSQL image major versions 13 and older are end-of-life | [`container.postgres.eol-13-and-older`](rules/container.postgres.eol-13-and-older.html) | end-of-life | 17 | 12 |
| library/ubuntu | Ubuntu image release line 22.04 reaches standard support end-of-life on 2027-06-01 | [`container.ubuntu.eol-22.04`](rules/container.ubuntu.eol-22.04.html) | scheduled-end-of-life | 17 | 9 |
| powershell | PowerShell 6.x is no longer supported | [`shell.powershell.end-of-life-6`](rules/shell.powershell.end-of-life-6.html) | end-of-life | 17 | 9 |
| aws-lambda-runtime/nodejs14.x | AWS Lambda Node.js 14 runtime is end-of-life | [`serverless.aws-lambda.nodejs14.x`](rules/serverless.aws-lambda.nodejs14.x.html) | end-of-life | 16 | 9 |
| azure-pipelines/windows-image | Azure Pipelines Windows Server 2019 hosted image is retired | [`ci-images.azure-pipelines.windows-2019`](rules/ci-images.azure-pipelines.windows-2019.html) | removed | 16 | 8 |
| cmake | CMake policy versions older than 3.10 are deprecated | [`cpp.cmake.policy-below-3.10.deprecated`](rules/cpp.cmake.policy-below-3.10.deprecated.html) | deprecated | 16 | 5 |
| kubernetes/extensions/Ingress | Ingress extensions/v1beta1 is no longer served | [`kubernetes.extensions.ingress.v1beta1.removed`](rules/kubernetes.extensions.ingress.v1beta1.removed.html) | removed | 16 | 10 |
| tempdir | tempdir is no longer maintained | [`rust.crate.tempdir.unmaintained`](rules/rust.crate.tempdir.unmaintained.html) | deprecated | 16 | 12 |
| swiftmailer/swiftmailer | swiftmailer/swiftmailer is abandoned | [`php.package.swiftmailer.swiftmailer.abandoned`](rules/php.package.swiftmailer.swiftmailer.abandoned.html) | deprecated | 15 | 14 |
| ansi_term | ansi_term is no longer maintained | [`rust.crate.ansi-term.unmaintained`](rules/rust.crate.ansi-term.unmaintained.html) | deprecated | 14 | 14 |
| doctrine/cache | doctrine/cache is abandoned | [`php.package.doctrine.cache.abandoned`](rules/php.package.doctrine.cache.abandoned.html) | deprecated | 14 | 12 |
| dotnet | .NET Core 3.0 is no longer supported | [`dotnet.runtime.end-of-support-3.0`](rules/dotnet.runtime.end-of-support-3.0.html) | end-of-support | 14 | 6 |
| fzaninotto/faker | fzaninotto/faker is abandoned | [`php.package.fzaninotto.faker.abandoned`](rules/php.package.fzaninotto.faker.abandoned.html) | deprecated | 14 | 8 |
| rails | Rails 8.0 security support is scheduled to end | [`ruby.gem.rails-8.0.scheduled-end-of-life`](rules/ruby.gem.rails-8.0.scheduled-end-of-life.html) | scheduled-end-of-life | 14 | 1 |
| ruby | Ruby 2.0.0 is end-of-life | [`ruby.runtime.eol-2.0.0`](rules/ruby.runtime.eol-2.0.0.html) | end-of-life | 14 | 2 |
| ruby | Ruby 2.6 is end-of-life | [`ruby.runtime.eol-2.6`](rules/ruby.runtime.eol-2.6.html) | end-of-life | 14 | 7 |
| next | Next.js 15 is out of support | [`npm.package.next.15.support-end`](rules/npm.package.next.15.support-end.html) | end-of-support | 13 | 4 |
| @angular/core | @angular/core v20 reaches end of life on 2026-11-28 | [`npm.package.angular.core.v20.scheduled-end-of-life`](rules/npm.package.angular.core.v20.scheduled-end-of-life.html) | scheduled-end-of-life | 12 | 1 |
| aws-lambda-runtime/provided.al2023 | AWS Lambda OS-only runtime provided.al2023 runtime reaches end of life on 2029-06-30 | [`serverless.aws-lambda.provided.al2023`](rules/serverless.aws-lambda.provided.al2023.html) | scheduled-end-of-life | 12 | 3 |
| elixir | Elixir 1.14 no longer receives security updates | [`elixir.runtime.eol-1.14`](rules/elixir.runtime.eol-1.14.html) | end-of-life | 12 | 12 |
| elixir | Elixir 1.15 no longer receives security updates | [`elixir.runtime.eol-1.15`](rules/elixir.runtime.eol-1.15.html) | end-of-life | 12 | 12 |
| failure | failure is no longer maintained | [`rust.crate.failure.unmaintained`](rules/rust.crate.failure.unmaintained.html) | deprecated | 12 | 6 |
| library/ruby | Ruby image release lines 3.2 and older are end-of-life | [`container.ruby.eol-3.2-and-older`](rules/container.ruby.eol-3.2-and-older.html) | end-of-life | 12 | 9 |
| node-sass | node-sass is deprecated | [`npm.package.node-sass.deprecated`](rules/npm.package.node-sass.deprecated.html) | deprecated | 12 | 12 |
| node-sass | Node Sass is end-of-life | [`npm.package.node-sass.eol`](rules/npm.package.node-sass.eol.html) | end-of-life | 12 | 12 |
| github.com/golang/protobuf | github.com/golang/protobuf is deprecated | [`go.module.github.com.golang.protobuf.deprecated`](rules/go.module.github.com.golang.protobuf.deprecated.html) | deprecated | 10 | 4 |
| ruby | Ruby 2.5 is end-of-life | [`ruby.runtime.eol-2.5`](rules/ruby.runtime.eol-2.5.html) | end-of-life | 10 | 6 |
| vue | Vue 2 is end-of-life | [`npm.package.vue.eol-2`](rules/npm.package.vue.eol-2.html) | end-of-life | 10 | 10 |
| aws-lambda-runtime/nodejs12.x | AWS Lambda Node.js 12 runtime is end-of-life | [`serverless.aws-lambda.nodejs12.x`](rules/serverless.aws-lambda.nodejs12.x.html) | end-of-life | 9 | 3 |
| babel-preset-es2015 | babel-preset-es2015 is deprecated | [`npm.package.babel-preset-es2015.deprecated`](rules/npm.package.babel-preset-es2015.deprecated.html) | deprecated | 9 | 9 |
| golang | Go 1.22 is no longer supported | [`go.runtime.end-of-support-1.22`](rules/go.runtime.end-of-support-1.22.html) | end-of-support | 9 | 7 |
| mysql | MySQL 5.7 is end-of-life | [`database.mysql.end-of-life-5.7`](rules/database.mysql.end-of-life-5.7.html) | end-of-life | 9 | 6 |
| actions/configure-pages | Unsupported actions/configure-pages runtime | [`github-actions.configure-pages.node20`](rules/github-actions.configure-pages.node20.html) | end-of-support | 8 | 8 |
| aws-lambda-runtime/python3.8 | AWS Lambda Python 3.8 runtime is end-of-life | [`serverless.aws-lambda.python3.8`](rules/serverless.aws-lambda.python3.8.html) | end-of-life | 8 | 3 |
| aws-lambda-runtime/ruby4.0 | AWS Lambda Ruby 4.0 runtime reaches end of life on 2029-03-31 | [`serverless.aws-lambda.ruby4.0`](rules/serverless.aws-lambda.ruby4.0.html) | scheduled-end-of-life | 8 | 1 |
| dart | Dart 3.8 no longer receives security updates | [`dart.sdk.end-of-support-3.8`](rules/dart.sdk.end-of-support-3.8.html) | end-of-support | 8 | 4 |
| kubernetes/apps/Deployment | Deployment apps/v1beta1 is no longer served | [`kubernetes.apps.deployment.v1beta1.removed`](rules/kubernetes.apps.deployment.v1beta1.removed.html) | removed | 8 | 2 |
| kubernetes/storage.k8s.io/StorageClass | StorageClass storage.k8s.io/v1beta1 is no longer served | [`kubernetes.storage-k8s-io.storageclass.v1beta1.removed`](rules/kubernetes.storage-k8s-io.storageclass.v1beta1.removed.html) | removed | 8 | 2 |
| library/python | Python image release line 3.11 reaches end-of-life on 2027-10-31 | [`container.python.eol-3.11-and-older`](rules/container.python.eol-3.11-and-older.html) | scheduled-end-of-life | 8 | 5 |
| nodejs | Node.js 21 is end-of-life | [`nodejs.runtime.eol-21`](rules/nodejs.runtime.eol-21.html) | end-of-life | 8 | 2 |
| ruby | Ruby 3.0 is end-of-life | [`ruby.runtime.eol-3.0`](rules/ruby.runtime.eol-3.0.html) | end-of-life | 8 | 7 |
| aws-lambda-runtime/nodejs22.x | AWS Lambda Node.js 22 runtime reaches end of life on 2027-04-30 | [`serverless.aws-lambda.nodejs22.x`](rules/serverless.aws-lambda.nodejs22.x.html) | scheduled-end-of-life | 7 | 3 |
| golang | Go 1.21 is no longer supported | [`go.runtime.end-of-support-1.21`](rules/go.runtime.end-of-support-1.21.html) | end-of-support | 7 | 5 |
| golang | Go 1.23 is no longer supported | [`go.runtime.end-of-support-1.23`](rules/go.runtime.end-of-support-1.23.html) | end-of-support | 7 | 5 |
| nodejs | Node.js 25 is end-of-life | [`nodejs.runtime.eol-25`](rules/nodejs.runtime.eol-25.html) | end-of-life | 7 | 3 |
| postgresql | PostgreSQL 13 is no longer a supported major version | [`database.postgresql.end-of-life-13`](rules/database.postgresql.end-of-life-13.html) | end-of-life | 7 | 7 |
| kubernetes/apiextensions.k8s.io/CustomResourceDefinition | CustomResourceDefinition apiextensions.k8s.io/v1beta1 is no longer served | [`kubernetes.apiextensions-k8s-io.customresourcedefinition.v1beta1.removed`](rules/kubernetes.apiextensions-k8s-io.customresourcedefinition.v1beta1.removed.html) | removed | 6 | 3 |
| ruby | Ruby 2.3 is end-of-life | [`ruby.runtime.eol-2.3`](rules/ruby.runtime.eol-2.3.html) | end-of-life | 6 | 3 |
| com.android.billingclient/billing | Google Play Billing Library 8 reaches its new-app and update deadline on 2027-08-31 | [`android.play-billing.version-8`](rules/android.play-billing.version-8.html) | scheduled-end-of-life | 5 | 3 |
| dotnet | .NET Core 2.1 is no longer supported | [`dotnet.runtime.end-of-support-2.1`](rules/dotnet.runtime.end-of-support-2.1.html) | end-of-support | 5 | 3 |
| kubernetes/batch/CronJob | CronJob batch/v1beta1 is no longer served | [`kubernetes.batch.cronjob.v1beta1.removed`](rules/kubernetes.batch.cronjob.v1beta1.removed.html) | removed | 5 | 3 |
| kubernetes/extensions/PodSecurityPolicy | PodSecurityPolicy extensions/v1beta1 is no longer served | [`kubernetes.extensions.podsecuritypolicy.v1beta1.removed`](rules/kubernetes.extensions.podsecuritypolicy.v1beta1.removed.html) | removed | 5 | 1 |
| library/redis | Redis image release lines 6.0 and older are end-of-life | [`container.redis.eol-6.0-and-older`](rules/container.redis.eol-6.0-and-older.html) | end-of-life | 5 | 3 |
| react-native | React Native 0.77 through 0.84 are unsupported | [`npm.package.react-native.0.77-to-0.84.end-of-support`](rules/npm.package.react-native.0.77-to-0.84.end-of-support.html) | end-of-support | 5 | 3 |
| rollup-plugin-terser | rollup-plugin-terser is deprecated | [`npm.package.rollup-plugin-terser.deprecated`](rules/npm.package.rollup-plugin-terser.deprecated.html) | deprecated | 5 | 5 |
| dotnet | .NET Core 2.2 is no longer supported | [`dotnet.runtime.end-of-support-2.2`](rules/dotnet.runtime.end-of-support-2.2.html) | end-of-support | 4 | 2 |
| istanbul | istanbul is deprecated | [`npm.package.istanbul.deprecated`](rules/npm.package.istanbul.deprecated.html) | deprecated | 4 | 4 |
| java | Java 22 to 24 are no longer supported | [`java.jdk.end-of-support-22-24`](rules/java.jdk.end-of-support-22-24.html) | end-of-support | 4 | 4 |
| kubernetes/extensions/DaemonSet | DaemonSet extensions/v1beta1 is no longer served | [`kubernetes.extensions.daemonset.v1beta1.removed`](rules/kubernetes.extensions.daemonset.v1beta1.removed.html) | removed | 4 | 2 |
| kubernetes/rbac.authorization.k8s.io/ClusterRoleBinding | ClusterRoleBinding rbac.authorization.k8s.io/v1beta1 is no longer served | [`kubernetes.rbac-authorization-k8s-io.clusterrolebinding.v1beta1.removed`](rules/kubernetes.rbac-authorization-k8s-io.clusterrolebinding.v1beta1.removed.html) | removed | 4 | 3 |
| library/mysql | MySQL image release lines 8.0 and older are past end-of-life | [`container.mysql.eol-8.0-and-older`](rules/container.mysql.eol-8.0-and-older.html) | end-of-life | 4 | 4 |
| library/postgres | PostgreSQL image release line 14 reaches end-of-life on 2026-11-12 | [`container.postgres.eol-14-and-older`](rules/container.postgres.eol-14-and-older.html) | scheduled-end-of-life | 4 | 4 |
| next | Next.js 14 is out of support | [`npm.package.next.14.support-end`](rules/npm.package.next.14.support-end.html) | end-of-support | 4 | 3 |
| powershell | PowerShell 7.1 is no longer supported | [`shell.powershell.end-of-life-7.1`](rules/shell.powershell.end-of-life-7.1.html) | end-of-life | 4 | 3 |
| request | request is deprecated | [`npm.package.request.deprecated`](rules/npm.package.request.deprecated.html) | deprecated | 4 | 4 |
| terraform | Terraform CLI 1.13 is no longer a supported release line | [`terraform.cli.end-of-support-1.13`](rules/terraform.cli.end-of-support-1.13.html) | end-of-support | 4 | 3 |
| tslint | tslint is deprecated | [`npm.package.tslint.deprecated`](rules/npm.package.tslint.deprecated.html) | deprecated | 4 | 4 |
| WindowsAzure.Storage | WindowsAzure.Storage is deprecated on NuGet | [`dotnet.package.windowsazure-storage.deprecated`](rules/dotnet.package.windowsazure-storage.deprecated.html) | deprecated | 4 | 4 |
| actions/first-interaction | Unsupported actions/first-interaction runtime | [`github-actions.first-interaction.node20`](rules/github-actions.first-interaction.node20.html) | end-of-support | 3 | 3 |
| actions/labeler | Unsupported actions/labeler runtime | [`github-actions.labeler.node20`](rules/github-actions.labeler.node20.html) | end-of-support | 3 | 3 |
| aws-lambda-runtime/provided.al2 | AWS Lambda OS-only runtime provided.al2 runtime is end-of-life | [`serverless.aws-lambda.provided.al2`](rules/serverless.aws-lambda.provided.al2.html) | end-of-life | 3 | 2 |
| azure-pipelines/macos-image | Azure Pipelines macOS 14 Sonoma hosted image is scheduled for removal | [`ci-images.azure-pipelines.macos-14`](rules/ci-images.azure-pipelines.macos-14.html) | scheduled-end-of-life | 3 | 3 |
| django | Django 4.2 LTS is end-of-life | [`python.package.django-4.2.eol`](rules/python.package.django-4.2.eol.html) | end-of-life | 3 | 3 |
| kubernetes/extensions/ReplicaSet | ReplicaSet extensions/v1beta1 is no longer served | [`kubernetes.extensions.replicaset.v1beta1.removed`](rules/kubernetes.extensions.replicaset.v1beta1.removed.html) | removed | 3 | 2 |
| nodejs | Node.js 23 is end-of-life | [`nodejs.runtime.eol-23`](rules/nodejs.runtime.eol-23.html) | end-of-life | 3 | 3 |
| popper.js | popper.js is deprecated | [`npm.package.popper.js.deprecated`](rules/npm.package.popper.js.deprecated.html) | deprecated | 3 | 3 |
| postgresql | PostgreSQL 11 is no longer a supported major version | [`database.postgresql.end-of-life-11`](rules/database.postgresql.end-of-life-11.html) | end-of-life | 3 | 3 |
| postgresql | PostgreSQL 12 is no longer a supported major version | [`database.postgresql.end-of-life-12`](rules/database.postgresql.end-of-life-12.html) | end-of-life | 3 | 3 |
| postgresql | PostgreSQL 14 reaches the end of its support on 2026-11-12 | [`database.postgresql.end-of-life-14`](rules/database.postgresql.end-of-life-14.html) | scheduled-end-of-life | 3 | 3 |
| redis | Redis 7.0 is end-of-life | [`database.redis.end-of-life-7.0`](rules/database.redis.end-of-life-7.0.html) | end-of-life | 3 | 3 |
| rollup-plugin-babel | rollup-plugin-babel is deprecated | [`npm.package.rollup-plugin-babel.deprecated`](rules/npm.package.rollup-plugin-babel.deprecated.html) | deprecated | 3 | 3 |
| terraform | Terraform CLI 1.12 is no longer a supported release line | [`terraform.cli.end-of-support-1.12`](rules/terraform.cli.end-of-support-1.12.html) | end-of-support | 3 | 2 |
| @angular/core | @angular/core v18 and older are no longer supported | [`npm.package.angular.core.v18-and-older.end-of-support`](rules/npm.package.angular.core.v18-and-older.end-of-support.html) | end-of-support | 2 | 2 |
| @angular/core | @angular/core v19 is no longer supported | [`npm.package.angular.core.v19.end-of-support`](rules/npm.package.angular.core.v19.end-of-support.html) | end-of-support | 2 | 2 |
| aws-lambda-runtime/nodejs16.x | AWS Lambda Node.js 16 runtime is end-of-life | [`serverless.aws-lambda.nodejs16.x`](rules/serverless.aws-lambda.nodejs16.x.html) | end-of-life | 2 | 1 |
| aws-lambda-runtime/nodejs20.x | AWS Lambda Node.js 20 runtime is end-of-life | [`serverless.aws-lambda.nodejs20.x`](rules/serverless.aws-lambda.nodejs20.x.html) | end-of-life | 2 | 1 |
| crypto-js | crypto-js is deprecated | [`npm.package.crypto-js.deprecated`](rules/npm.package.crypto-js.deprecated.html) | deprecated | 2 | 2 |
| github-actions/add-path | Removed GitHub Actions ::add-path command | [`github-actions.workflow-command.add-path`](rules/github-actions.workflow-command.add-path.html) | removed | 2 | 1 |
| github-actions/set-env | Removed GitHub Actions ::set-env command | [`github-actions.workflow-command.set-env`](rules/github-actions.workflow-command.set-env.html) | removed | 2 | 1 |
| hashicorp/setup-terraform | Unsupported hashicorp/setup-terraform runtime | [`github-actions.setup-terraform.node20`](rules/github-actions.setup-terraform.node20.html) | end-of-support | 2 | 2 |
| karma-phantomjs-launcher | karma-phantomjs-launcher is deprecated | [`npm.package.karma-phantomjs-launcher.deprecated`](rules/npm.package.karma-phantomjs-launcher.deprecated.html) | deprecated | 2 | 2 |
| kubernetes/apps/ReplicaSet | ReplicaSet apps/v1beta2 is no longer served | [`kubernetes.apps.replicaset.v1beta2.removed`](rules/kubernetes.apps.replicaset.v1beta2.removed.html) | removed | 2 | 1 |
| kubernetes/apps/StatefulSet | StatefulSet apps/v1beta1 is no longer served | [`kubernetes.apps.statefulset.v1beta1.removed`](rules/kubernetes.apps.statefulset.v1beta1.removed.html) | removed | 2 | 2 |
| kubernetes/policy/PodDisruptionBudget | PodDisruptionBudget policy/v1beta1 is no longer served | [`kubernetes.policy.poddisruptionbudget.v1beta1.removed`](rules/kubernetes.policy.poddisruptionbudget.v1beta1.removed.html) | removed | 2 | 2 |
| kubernetes/policy/PodSecurityPolicy | PodSecurityPolicy policy/v1beta1 is no longer served | [`kubernetes.policy.podsecuritypolicy.v1beta1.removed`](rules/kubernetes.policy.podsecuritypolicy.v1beta1.removed.html) | removed | 2 | 1 |
| laravel/framework | Laravel 11 is no longer supported | [`php.package.laravel.framework-11.end-of-support`](rules/php.package.laravel.framework-11.end-of-support.html) | end-of-support | 2 | 1 |
| next | Next.js 12 is out of support | [`npm.package.next.12.support-end`](rules/npm.package.next.12.support-end.html) | end-of-support | 2 | 2 |
| postgresql | PostgreSQL 10 is no longer a supported major version | [`database.postgresql.end-of-life-10`](rules/database.postgresql.end-of-life-10.html) | end-of-life | 2 | 2 |
| protractor | Protractor is deprecated | [`npm.package.protractor.deprecated`](rules/npm.package.protractor.deprecated.html) | deprecated | 2 | 2 |
| pycrypto | PyCrypto is obsolete and vulnerable | [`python.package.pycrypto.obsolete`](rules/python.package.pycrypto.obsolete.html) | end-of-life | 2 | 2 |
| request-promise | request-promise is deprecated | [`npm.package.request-promise.deprecated`](rules/npm.package.request-promise.deprecated.html) | deprecated | 2 | 2 |
| ruby | Ruby 2.1 is end-of-life | [`ruby.runtime.eol-2.1`](rules/ruby.runtime.eol-2.1.html) | end-of-life | 2 | 2 |
| scala | Scala 3.0–3.2 no longer receive patches | [`scala.runtime.eos-3.0-3.2`](rules/scala.runtime.eos-3.0-3.2.html) | end-of-support | 2 | 2 |
| sensiolabs/security-checker | sensiolabs/security-checker is abandoned | [`php.package.sensiolabs.security-checker.abandoned`](rules/php.package.sensiolabs.security-checker.abandoned.html) | deprecated | 2 | 1 |
| uglify-es | uglify-es is deprecated | [`npm.package.uglify-es.deprecated`](rules/npm.package.uglify-es.deprecated.html) | deprecated | 2 | 2 |
| @types/dotenv | @types/dotenv is deprecated | [`npm.package.types.dotenv.deprecated`](rules/npm.package.types.dotenv.deprecated.html) | deprecated | 1 | 1 |
| @types/emoji-regex | @types/emoji-regex is deprecated | [`npm.package.types.emoji-regex.deprecated`](rules/npm.package.types.emoji-regex.deprecated.html) | deprecated | 1 | 1 |
| @types/form-data | @types/form-data is deprecated | [`npm.package.types.form-data.deprecated`](rules/npm.package.types.form-data.deprecated.html) | deprecated | 1 | 1 |
| @types/koa-useragent | @types/koa-useragent is deprecated | [`npm.package.types.koa-useragent.deprecated`](rules/npm.package.types.koa-useragent.deprecated.html) | deprecated | 1 | 1 |
| @types/sanitize-filename | @types/sanitize-filename is deprecated | [`npm.package.types.sanitize-filename.deprecated`](rules/npm.package.types.sanitize-filename.deprecated.html) | deprecated | 1 | 1 |
| @types/socket.io-client | @types/socket.io-client is deprecated | [`npm.package.types.socket.io-client.deprecated`](rules/npm.package.types.socket.io-client.deprecated.html) | deprecated | 1 | 1 |
| amazon-eks | Amazon EKS 1.30 and earlier are past end of extended support | [`terraform.eks.end-of-life-1.30-and-older`](rules/terraform.eks.end-of-life-1.30-and-older.html) | end-of-life | 1 | 1 |
| aws-lambda-runtime/dotnet10 | AWS Lambda .NET 10 runtime reaches end of life on 2028-11-14 | [`serverless.aws-lambda.dotnet10`](rules/serverless.aws-lambda.dotnet10.html) | scheduled-end-of-life | 1 | 1 |
| aws-lambda-runtime/java25 | AWS Lambda Java 25 runtime reaches end of life on 2029-06-30 | [`serverless.aws-lambda.java25`](rules/serverless.aws-lambda.java25.html) | scheduled-end-of-life | 1 | 1 |
| aws-lambda-runtime/nodejs10.x | AWS Lambda Node.js 10 runtime is end-of-life | [`serverless.aws-lambda.nodejs10.x`](rules/serverless.aws-lambda.nodejs10.x.html) | end-of-life | 1 | 1 |
| aws-lambda-runtime/nodejs18.x | AWS Lambda Node.js 18 runtime is end-of-life | [`serverless.aws-lambda.nodejs18.x`](rules/serverless.aws-lambda.nodejs18.x.html) | end-of-life | 1 | 1 |
| aws-lambda-runtime/python3.13 | AWS Lambda Python 3.13 runtime reaches end of life on 2029-06-30 | [`serverless.aws-lambda.python3.13`](rules/serverless.aws-lambda.python3.13.html) | scheduled-end-of-life | 1 | 1 |
| aws-lambda-runtime/ruby2.7 | AWS Lambda Ruby 2.7 runtime is end-of-life | [`serverless.aws-lambda.ruby2.7`](rules/serverless.aws-lambda.ruby2.7.html) | end-of-life | 1 | 1 |
| bun | Bun 1.0.x is end-of-life | [`deno.bun.runtime.eol-1.0`](rules/deno.bun.runtime.eol-1.0.html) | end-of-life | 1 | 1 |
| cloud.google.com/go/pubsub | cloud.google.com/go/pubsub is deprecated | [`go.module.cloud.google.com.go.pubsub.deprecated`](rules/go.module.cloud.google.com.go.pubsub.deprecated.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 5 is past its deprecation deadline | [`android.play-billing.version-5`](rules/android.play-billing.version-5.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 6 is past its deprecation deadline | [`android.play-billing.version-6`](rules/android.play-billing.version-6.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 7 is past its deprecation deadline | [`android.play-billing.version-7`](rules/android.play-billing.version-7.html) | deprecated | 1 | 1 |
| com.android.billingclient/billing | Google Play Billing Library 9 reaches its new-app and update deadline on 2028-08-31 | [`android.play-billing.version-9`](rules/android.play-billing.version-9.html) | scheduled-end-of-life | 1 | 1 |
| dart | Dart 3.11 no longer receives security updates | [`dart.sdk.end-of-support-3.11`](rules/dart.sdk.end-of-support-3.11.html) | end-of-support | 1 | 1 |
| deno | Deno 1.x is end-of-life | [`deno.runtime.eol-1.x`](rules/deno.runtime.eol-1.x.html) | end-of-life | 1 | 1 |
| django | Django 2.2 LTS is end-of-life | [`python.package.django-2.2.eol`](rules/python.package.django-2.2.eol.html) | end-of-life | 1 | 1 |
| domexception | domexception is deprecated | [`npm.package.domexception.deprecated`](rules/npm.package.domexception.deprecated.html) | deprecated | 1 | 1 |
| google-cloud-functions-runtime/nodejs14 | Google Cloud Functions Node.js 14 runtime is end-of-life | [`serverless.google-cloud-functions.nodejs14`](rules/serverless.google-cloud-functions.nodejs14.html) | end-of-life | 1 | 1 |
| google-cloud-functions-runtime/nodejs20 | Google Cloud Functions Node.js 20 runtime is end-of-life | [`serverless.google-cloud-functions.nodejs20`](rules/serverless.google-cloud-functions.nodejs20.html) | end-of-life | 1 | 1 |
| google-cloud-functions-runtime/python37 | Google Cloud Functions Python 3.7 runtime is end-of-life | [`serverless.google-cloud-functions.python37`](rules/serverless.google-cloud-functions.python37.html) | end-of-life | 1 | 1 |
| google-cloud-sql-mysql | Cloud SQL for MySQL 5.6 and 5.7 are in extended support | [`database.google-cloud-sql-mysql.extended-support-5.6-to-5.7`](rules/database.google-cloud-sql-mysql.extended-support-5.6-to-5.7.html) | end-of-support | 1 | 1 |
| gulp-util | gulp-util is deprecated | [`npm.package.gulp-util.deprecated`](rules/npm.package.gulp-util.deprecated.html) | deprecated | 1 | 1 |
| helm-repository/stable | Helm stable chart repository is end of life | [`kubernetes.helm.repository.stable.end-of-life`](rules/kubernetes.helm.repository.stable.end-of-life.html) | end-of-life | 1 | 1 |
| i18next-parser | i18next-parser is deprecated | [`npm.package.i18next-parser.deprecated`](rules/npm.package.i18next-parser.deprecated.html) | deprecated | 1 | 1 |
| koa-router | koa-router is deprecated | [`npm.package.koa-router.deprecated`](rules/npm.package.koa-router.deprecated.html) | deprecated | 1 | 1 |
| kubernetes/admissionregistration.k8s.io/MutatingWebhookConfiguration | MutatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served | [`kubernetes.admissionregistration-k8s-io.mutatingwebhookconfiguration.v1beta1.removed`](rules/kubernetes.admissionregistration-k8s-io.mutatingwebhookconfiguration.v1beta1.removed.html) | removed | 1 | 1 |
| kubernetes/admissionregistration.k8s.io/ValidatingWebhookConfiguration | ValidatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served | [`kubernetes.admissionregistration-k8s-io.validatingwebhookconfiguration.v1beta1.removed`](rules/kubernetes.admissionregistration-k8s-io.validatingwebhookconfiguration.v1beta1.removed.html) | removed | 1 | 1 |
| kubernetes/apps/DaemonSet | DaemonSet apps/v1beta2 is no longer served | [`kubernetes.apps.daemonset.v1beta2.removed`](rules/kubernetes.apps.daemonset.v1beta2.removed.html) | removed | 1 | 1 |
| kubernetes/apps/Deployment | Deployment apps/v1beta2 is no longer served | [`kubernetes.apps.deployment.v1beta2.removed`](rules/kubernetes.apps.deployment.v1beta2.removed.html) | removed | 1 | 1 |
| kubernetes/autoscaling/HorizontalPodAutoscaler | HorizontalPodAutoscaler autoscaling/v2beta1 is no longer served | [`kubernetes.autoscaling.horizontalpodautoscaler.v2beta1.removed`](rules/kubernetes.autoscaling.horizontalpodautoscaler.v2beta1.removed.html) | removed | 1 | 1 |
| kubernetes/autoscaling/HorizontalPodAutoscaler | HorizontalPodAutoscaler autoscaling/v2beta2 is no longer served | [`kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed`](rules/kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed.html) | removed | 1 | 1 |
| kubernetes/networking.k8s.io/Ingress | Ingress networking.k8s.io/v1beta1 is no longer served | [`kubernetes.networking-k8s-io.ingress.v1beta1.removed`](rules/kubernetes.networking-k8s-io.ingress.v1beta1.removed.html) | removed | 1 | 1 |
| kubernetes/rbac.authorization.k8s.io/ClusterRole | ClusterRole rbac.authorization.k8s.io/v1beta1 is no longer served | [`kubernetes.rbac-authorization-k8s-io.clusterrole.v1beta1.removed`](rules/kubernetes.rbac-authorization-k8s-io.clusterrole.v1beta1.removed.html) | removed | 1 | 1 |
| library/zookeeper | Apache ZooKeeper image release lines 3.7 and older are end-of-life | [`container.zookeeper.eol-3.7-and-older`](rules/container.zookeeper.eol-3.7-and-older.html) | end-of-life | 1 | 1 |
| lodash.isequal | lodash.isequal is deprecated | [`npm.package.lodash-isequal.deprecated`](rules/npm.package.lodash-isequal.deprecated.html) | deprecated | 1 | 1 |
| mysql/mysql-connector-java | mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j | [`java.maven.mysql.mysql-connector-java.relocated`](rules/java.maven.mysql.mysql-connector-java.relocated.html) | deprecated | 1 | 1 |
| natives | natives is deprecated | [`npm.package.natives.deprecated`](rules/npm.package.natives.deprecated.html) | deprecated | 1 | 1 |
| next | Next.js 13 is out of support | [`npm.package.next.13.support-end`](rules/npm.package.next.13.support-end.html) | end-of-support | 1 | 1 |
| nose | nose is maintenance-only | [`python.package.nose.maintenance-only`](rules/python.package.nose.maintenance-only.html) | deprecated | 1 | 1 |
| php | PHP 7.3 is end-of-life | [`php.runtime.eol-7.3`](rules/php.runtime.eol-7.3.html) | end-of-life | 1 | 1 |
| powershell | PowerShell 7.3 is no longer supported | [`shell.powershell.end-of-life-7.3`](rules/shell.powershell.end-of-life-7.3.html) | end-of-life | 1 | 1 |
| pytest-runner | pytest-runner is deprecated | [`python.package.pytest-runner.deprecated`](rules/python.package.pytest-runner.deprecated.html) | deprecated | 1 | 1 |
| q | q is deprecated | [`npm.package.q.deprecated`](rules/npm.package.q.deprecated.html) | deprecated | 1 | 1 |
| react-beautiful-dnd | react-beautiful-dnd is deprecated | [`npm.package.react-beautiful-dnd.deprecated`](rules/npm.package.react-beautiful-dnd.deprecated.html) | deprecated | 1 | 1 |
| ruby | Ruby 2.2 is end-of-life | [`ruby.runtime.eol-2.2`](rules/ruby.runtime.eol-2.2.html) | end-of-life | 1 | 1 |
| ruby | Ruby 2.4 is end-of-life | [`ruby.runtime.eol-2.4`](rules/ruby.runtime.eol-2.4.html) | end-of-life | 1 | 1 |
| socket.io-redis | socket.io-redis is deprecated | [`npm.package.socket.io-redis.deprecated`](rules/npm.package.socket.io-redis.deprecated.html) | deprecated | 1 | 1 |
| typing | typing is archived on PyPI | [`python.package.typing.archived`](rules/python.package.typing.archived.html) | end-of-life | 1 | 1 |
| zendframework/zend-stdlib | zendframework/zend-stdlib is abandoned | [`php.package.zendframework.zend-stdlib.abandoned`](rules/php.package.zendframework.zend-stdlib.abandoned.html) | deprecated | 1 | 1 |
<!-- state-of-eol:end -->

## Limits

Counts come from expected findings in `benchmarks/public-repositories/`, joined to bundled rules in `registry/`. Scans never use the network. A product with no corpus finding does not appear here.
