---
title: "Lifecycle reference — end of life, removed, and deprecated components"
description: "One page per lifecycle rule: status, affected versions, dates, sources, migration, and the detector that reads it."
canonical_url: "https://arminazimi.github.io/evergreen/rules/"
---

# Lifecycle reference

Every lifecycle claim Evergreen makes comes from a reviewed rule with an authoritative source. Each rule has a page with its status, affected versions, dates, sources, and migration steps. These pages are generated from the registry; see [Lifecycle rules](../RULES.md).

## ci-images

- [Azure Pipelines macOS 14 Sonoma hosted image is scheduled for removal](ci-images.azure-pipelines.macos-14.html) — scheduled end of life, `ci-images.azure-pipelines.macos-14`
- [Azure Pipelines Ubuntu 22.04 hosted image is scheduled for removal](ci-images.azure-pipelines.ubuntu-22.04.html) — scheduled end of life, `ci-images.azure-pipelines.ubuntu-22.04`

## container

- [MySQL image release lines 8.0 and older are past end-of-life](container.mysql.eol-8.0-and-older.html) — end of life, `container.mysql.eol-8.0-and-older`
- [Node.js image release lines 21 and older are end-of-life](container.node.eol-21-and-older.html) — end of life, `container.node.eol-21-and-older`
- [PostgreSQL image major versions 13 and older are end-of-life](container.postgres.eol-13-and-older.html) — end of life, `container.postgres.eol-13-and-older`
- [Python image release lines 3.10 and older are end-of-life](container.python.eol-3.10-and-older.html) — end of life, `container.python.eol-3.10-and-older`
- [Ruby image release lines 3.2 and older are end-of-life](container.ruby.eol-3.2-and-older.html) — end of life, `container.ruby.eol-3.2-and-older`

## cpp

- [The Visual Studio 12 2013 generator is removed](cpp.cmake.generator.visual-studio-12-2013.removed.html) — removed, `cpp.cmake.generator.visual-studio-12-2013.removed`
- [The CMakeFindFrameworks module is deprecated](cpp.cmake.module.cmake-find-frameworks.deprecated.html) — deprecated, `cpp.cmake.module.cmake-find-frameworks.deprecated`
- [The FindGDAL module is deprecated](cpp.cmake.module.find-gdal.deprecated.html) — deprecated, `cpp.cmake.module.find-gdal.deprecated`
- [CMake policy versions older than 3.10 are deprecated](cpp.cmake.policy-below-3.10.deprecated.html) — deprecated, `cpp.cmake.policy-below-3.10.deprecated`
- [CMake policy versions older than 3.5 are removed](cpp.cmake.policy-below-3.5.removed.html) — removed, `cpp.cmake.policy-below-3.5.removed`

## dotnet

- [WindowsAzure.Storage is deprecated on NuGet](dotnet.package.windowsazure-storage.deprecated.html) — deprecated, `dotnet.package.windowsazure-storage.deprecated`
- [.NET Core 3.1 is no longer supported](dotnet.runtime.end-of-support-3.1.html) — end of support, `dotnet.runtime.end-of-support-3.1`
- [.NET 5 is no longer supported](dotnet.runtime.end-of-support-5.0.html) — end of support, `dotnet.runtime.end-of-support-5.0`
- [.NET 6 is no longer supported](dotnet.runtime.end-of-support-6.0.html) — end of support, `dotnet.runtime.end-of-support-6.0`
- [.NET 7 is no longer supported](dotnet.runtime.end-of-support-7.0.html) — end of support, `dotnet.runtime.end-of-support-7.0`
- [.NET 8 reaches end of support on 2026-11-10](dotnet.runtime.end-of-support-8.0.html) — scheduled end of life, `dotnet.runtime.end-of-support-8.0`
- [.NET 9 reaches end of support on 2026-11-10](dotnet.runtime.end-of-support-9.0.html) — scheduled end of life, `dotnet.runtime.end-of-support-9.0`

## github-actions

- [Unsupported softprops/action-gh-release runtime](github-actions.action-gh-release.node20.html) — end of support, `github-actions.action-gh-release.node20`
- [Unsupported docker/bake-action runtime](github-actions.bake-action.node20.html) — end of support, `github-actions.bake-action.node20`
- [Unsupported docker/build-push-action runtime](github-actions.build-push-action.node20.html) — end of support, `github-actions.build-push-action.node20`
- [Unsupported actions/cache runtime](github-actions.cache.node20.html) — end of support, `github-actions.cache.node20`
- [Unsupported actions/checkout runtime](github-actions.checkout.node20.html) — end of support, `github-actions.checkout.node20`
- [Unsupported actions/configure-pages runtime](github-actions.configure-pages.node20.html) — end of support, `github-actions.configure-pages.node20`
- [Unsupported actions/create-github-app-token runtime](github-actions.create-github-app-token.node20.html) — end of support, `github-actions.create-github-app-token.node20`
- [Unsupported actions/deploy-pages runtime](github-actions.deploy-pages.node20.html) — end of support, `github-actions.deploy-pages.node20`
- [Retired actions/download-artifact release](github-actions.download-artifact.retired.html) — removed, `github-actions.download-artifact.retired`
- [Unsupported actions/first-interaction runtime](github-actions.first-interaction.node20.html) — end of support, `github-actions.first-interaction.node20`
- [Unsupported actions/github-script runtime](github-actions.github-script.node20.html) — end of support, `github-actions.github-script.node20`
- [Unsupported actions/labeler runtime](github-actions.labeler.node20.html) — end of support, `github-actions.labeler.node20`
- [Unsupported docker/login-action runtime](github-actions.login-action.node20.html) — end of support, `github-actions.login-action.node20`
- [Unsupported docker/metadata-action runtime](github-actions.metadata-action.node20.html) — end of support, `github-actions.metadata-action.node20`
- [Unsupported docker/setup-buildx-action runtime](github-actions.setup-buildx-action.node20.html) — end of support, `github-actions.setup-buildx-action.node20`
- [Unsupported actions/setup-dotnet runtime](github-actions.setup-dotnet.node20.html) — end of support, `github-actions.setup-dotnet.node20`
- [Unsupported actions/setup-go runtime](github-actions.setup-go.node20.html) — end of support, `github-actions.setup-go.node20`
- [Unsupported actions/setup-java runtime](github-actions.setup-java.node20.html) — end of support, `github-actions.setup-java.node20`
- [Unsupported actions/setup-node runtime](github-actions.setup-node.node20.html) — end of support, `github-actions.setup-node.node20`
- [Unsupported actions/setup-python runtime](github-actions.setup-python.node20.html) — end of support, `github-actions.setup-python.node20`
- [Unsupported docker/setup-qemu-action runtime](github-actions.setup-qemu-action.node20.html) — end of support, `github-actions.setup-qemu-action.node20`
- [Unsupported hashicorp/setup-terraform runtime](github-actions.setup-terraform.node20.html) — end of support, `github-actions.setup-terraform.node20`
- [Unsupported astral-sh/setup-uv runtime](github-actions.setup-uv.node20.html) — end of support, `github-actions.setup-uv.node20`
- [Unsupported actions/stale runtime](github-actions.stale.node20.html) — end of support, `github-actions.stale.node20`
- [Retired actions/upload-artifact release](github-actions.upload-artifact.retired.html) — removed, `github-actions.upload-artifact.retired`

## go

- [Go 1.20 and older are no longer supported](go.runtime.end-of-support-1.20-and-older.html) — end of support, `go.runtime.end-of-support-1.20-and-older`
- [Go 1.21 is no longer supported](go.runtime.end-of-support-1.21.html) — end of support, `go.runtime.end-of-support-1.21`
- [Go 1.22 is no longer supported](go.runtime.end-of-support-1.22.html) — end of support, `go.runtime.end-of-support-1.22`
- [Go 1.23 is no longer supported](go.runtime.end-of-support-1.23.html) — end of support, `go.runtime.end-of-support-1.23`
- [Go 1.24 is no longer supported](go.runtime.end-of-support-1.24.html) — end of support, `go.runtime.end-of-support-1.24`
- [Go 1.25 is no longer supported](go.runtime.end-of-support-1.25.html) — end of support, `go.runtime.end-of-support-1.25`

## java

- [Java 12 to 16 are no longer supported](java.jdk.end-of-support-12-16.html) — end of support, `java.jdk.end-of-support-12-16`
- [Java 18 to 20 are no longer supported](java.jdk.end-of-support-18-20.html) — end of support, `java.jdk.end-of-support-18-20`
- [Java 22 to 24 are no longer supported](java.jdk.end-of-support-22-24.html) — end of support, `java.jdk.end-of-support-22-24`
- [Java 26 is no longer supported](java.jdk.end-of-support-26.html) — end of support, `java.jdk.end-of-support-26`
- [Java 9 and 10 are no longer supported](java.jdk.end-of-support-9-10.html) — end of support, `java.jdk.end-of-support-9-10`
- [mysql:mysql-connector-java has moved to com.mysql:mysql-connector-j](java.maven.mysql.mysql-connector-java.relocated.html) — deprecated, `java.maven.mysql.mysql-connector-java.relocated`
- [org.slf4j:slf4j-log4j12 has moved to org.slf4j:slf4j-reload4j](java.maven.org.slf4j.slf4j-log4j12.relocated.html) — deprecated, `java.maven.org.slf4j.slf4j-log4j12.relocated`

## kubernetes

- [HorizontalPodAutoscaler autoscaling/v2beta2 is no longer served](kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed.html) — removed, `kubernetes.autoscaling.horizontalpodautoscaler.v2beta2.removed`
- [CronJob batch/v1beta1 is no longer served](kubernetes.batch.cronjob.v1beta1.removed.html) — removed, `kubernetes.batch.cronjob.v1beta1.removed`
- [Ingress extensions/v1beta1 is no longer served](kubernetes.extensions.ingress.v1beta1.removed.html) — removed, `kubernetes.extensions.ingress.v1beta1.removed`
- [Ingress networking.k8s.io/v1beta1 is no longer served](kubernetes.networking-k8s-io.ingress.v1beta1.removed.html) — removed, `kubernetes.networking-k8s-io.ingress.v1beta1.removed`
- [PodSecurityPolicy policy/v1beta1 is no longer served](kubernetes.policy.podsecuritypolicy.v1beta1.removed.html) — removed, `kubernetes.policy.podsecuritypolicy.v1beta1.removed`

## nodejs

- [Node.js 18 is end-of-life](nodejs.runtime.eol-18.html) — end of life, `nodejs.runtime.eol-18`
- [Node.js 19 is end-of-life](nodejs.runtime.eol-19.html) — end of life, `nodejs.runtime.eol-19`
- [Node.js 20 is end-of-life](nodejs.runtime.eol-20.html) — end of life, `nodejs.runtime.eol-20`
- [Node.js 21 is end-of-life](nodejs.runtime.eol-21.html) — end of life, `nodejs.runtime.eol-21`
- [Node.js 23 is end-of-life](nodejs.runtime.eol-23.html) — end of life, `nodejs.runtime.eol-23`
- [Node.js 25 is end-of-life](nodejs.runtime.eol-25.html) — end of life, `nodejs.runtime.eol-25`
- [Legacy Node.js runtime is end-of-life](nodejs.runtime.legacy.html) — end of life, `nodejs.runtime.legacy`

## npm

- [abab is deprecated](npm.package.abab.deprecated.html) — deprecated, `npm.package.abab.deprecated`
- [are-we-there-yet is no longer supported](npm.package.are-we-there-yet.eol.html) — end of life, `npm.package.are-we-there-yet.eol`
- [babel-eslint is deprecated](npm.package.babel-eslint.deprecated.html) — deprecated, `npm.package.babel-eslint.deprecated`
- [babel-preset-es2015 is deprecated](npm.package.babel-preset-es2015.deprecated.html) — deprecated, `npm.package.babel-preset-es2015.deprecated`
- [boom is deprecated](npm.package.boom.deprecated.html) — deprecated, `npm.package.boom.deprecated`
- [cryptiles is deprecated](npm.package.cryptiles.deprecated.html) — deprecated, `npm.package.cryptiles.deprecated`
- [crypto-js is deprecated](npm.package.crypto-js.deprecated.html) — deprecated, `npm.package.crypto-js.deprecated`
- [domexception is deprecated](npm.package.domexception.deprecated.html) — deprecated, `npm.package.domexception.deprecated`
- [eslint-plugin-nuxt is deprecated](npm.package.eslint-plugin-nuxt.deprecated.html) — deprecated, `npm.package.eslint-plugin-nuxt.deprecated`
- [figgy-pudding is no longer supported](npm.package.figgy-pudding.eol.html) — end of life, `npm.package.figgy-pudding.eol`
- [fstream is no longer supported](npm.package.fstream.eol.html) — end of life, `npm.package.fstream.eol`
- [gauge is no longer supported](npm.package.gauge.eol.html) — end of life, `npm.package.gauge.eol`
- [gulp-util is deprecated](npm.package.gulp-util.deprecated.html) — deprecated, `npm.package.gulp-util.deprecated`
- [@hapi/joi is deprecated](npm.package.hapi.joi.deprecated.html) — deprecated, `npm.package.hapi.joi.deprecated`
- [har-validator is deprecated](npm.package.har-validator.deprecated.html) — deprecated, `npm.package.har-validator.deprecated`
- [@humanwhocodes/config-array is deprecated](npm.package.humanwhocodes-config-array.deprecated.html) — deprecated, `npm.package.humanwhocodes-config-array.deprecated`
- [@humanwhocodes/object-schema is deprecated](npm.package.humanwhocodes-object-schema.deprecated.html) — deprecated, `npm.package.humanwhocodes-object-schema.deprecated`
- [i18next-parser is deprecated](npm.package.i18next-parser.deprecated.html) — deprecated, `npm.package.i18next-parser.deprecated`
- [inflight is deprecated](npm.package.inflight.deprecated.html) — deprecated, `npm.package.inflight.deprecated`
- [istanbul is deprecated](npm.package.istanbul.deprecated.html) — deprecated, `npm.package.istanbul.deprecated`
- [jade is deprecated](npm.package.jade.deprecated.html) — deprecated, `npm.package.jade.deprecated`
- [karma-phantomjs-launcher is deprecated](npm.package.karma-phantomjs-launcher.deprecated.html) — deprecated, `npm.package.karma-phantomjs-launcher.deprecated`
- [koa-router is deprecated](npm.package.koa-router.deprecated.html) — deprecated, `npm.package.koa-router.deprecated`
- [left-pad is deprecated](npm.package.left-pad.deprecated.html) — deprecated, `npm.package.left-pad.deprecated`
- [lodash.get is deprecated](npm.package.lodash-get.deprecated.html) — deprecated, `npm.package.lodash-get.deprecated`
- [lodash.isequal is deprecated](npm.package.lodash-isequal.deprecated.html) — deprecated, `npm.package.lodash-isequal.deprecated`
- [natives is deprecated](npm.package.natives.deprecated.html) — deprecated, `npm.package.natives.deprecated`
- [node-pre-gyp is deprecated](npm.package.node-pre-gyp.deprecated.html) — deprecated, `npm.package.node-pre-gyp.deprecated`
- [Node Sass is end-of-life](npm.package.node-sass.eol.html) — end of life, `npm.package.node-sass.eol`
- [nomnom is deprecated](npm.package.nomnom.deprecated.html) — deprecated, `npm.package.nomnom.deprecated`
- [@npmcli/move-file is deprecated](npm.package.npmcli-move-file.deprecated.html) — deprecated, `npm.package.npmcli-move-file.deprecated`
- [npmlog is no longer supported](npm.package.npmlog.eol.html) — end of life, `npm.package.npmlog.eol`
- [@nuxt/types is deprecated](npm.package.nuxt.types.deprecated.html) — deprecated, `npm.package.nuxt.types.deprecated`
- [@nuxt/typescript-build is deprecated](npm.package.nuxt.typescript-build.deprecated.html) — deprecated, `npm.package.nuxt.typescript-build.deprecated`
- [osenv is no longer supported](npm.package.osenv.eol.html) — end of life, `npm.package.osenv.eol`
- [popper.js is deprecated](npm.package.popper.js.deprecated.html) — deprecated, `npm.package.popper.js.deprecated`
- [Protractor is deprecated](npm.package.protractor.deprecated.html) — deprecated, `npm.package.protractor.deprecated`
- [q is deprecated](npm.package.q.deprecated.html) — deprecated, `npm.package.q.deprecated`
- [querystring is deprecated](npm.package.querystring.deprecated.html) — deprecated, `npm.package.querystring.deprecated`
- [react-beautiful-dnd is deprecated](npm.package.react-beautiful-dnd.deprecated.html) — deprecated, `npm.package.react-beautiful-dnd.deprecated`
- [read-package-json is no longer supported](npm.package.read-package-json.eol.html) — end of life, `npm.package.read-package-json.eol`
- [request-promise-native is deprecated](npm.package.request-promise-native.deprecated.html) — deprecated, `npm.package.request-promise-native.deprecated`
- [request-promise is deprecated](npm.package.request-promise.deprecated.html) — deprecated, `npm.package.request-promise.deprecated`
- [request is deprecated](npm.package.request.deprecated.html) — deprecated, `npm.package.request.deprecated`
- [resolve-url is deprecated](npm.package.resolve-url.deprecated.html) — deprecated, `npm.package.resolve-url.deprecated`
- [rollup-plugin-babel is deprecated](npm.package.rollup-plugin-babel.deprecated.html) — deprecated, `npm.package.rollup-plugin-babel.deprecated`
- [rollup-plugin-terser is deprecated](npm.package.rollup-plugin-terser.deprecated.html) — deprecated, `npm.package.rollup-plugin-terser.deprecated`
- [sntp is deprecated](npm.package.sntp.deprecated.html) — deprecated, `npm.package.sntp.deprecated`
- [socket.io-redis is deprecated](npm.package.socket.io-redis.deprecated.html) — deprecated, `npm.package.socket.io-redis.deprecated`
- [source-map-url is deprecated](npm.package.source-map-url.deprecated.html) — deprecated, `npm.package.source-map-url.deprecated`
- [sourcemap-codec is deprecated](npm.package.sourcemap-codec.deprecated.html) — deprecated, `npm.package.sourcemap-codec.deprecated`
- [stable is deprecated](npm.package.stable.deprecated.html) — deprecated, `npm.package.stable.deprecated`
- [tslint is deprecated](npm.package.tslint.deprecated.html) — deprecated, `npm.package.tslint.deprecated`
- [@types/diff is deprecated](npm.package.types.diff.deprecated.html) — deprecated, `npm.package.types.diff.deprecated`
- [@types/dotenv is deprecated](npm.package.types.dotenv.deprecated.html) — deprecated, `npm.package.types.dotenv.deprecated`
- [@types/emoji-regex is deprecated](npm.package.types.emoji-regex.deprecated.html) — deprecated, `npm.package.types.emoji-regex.deprecated`
- [@types/form-data is deprecated](npm.package.types.form-data.deprecated.html) — deprecated, `npm.package.types.form-data.deprecated`
- [@types/glob is deprecated](npm.package.types.glob.deprecated.html) — deprecated, `npm.package.types.glob.deprecated`
- [@types/koa-helmet is deprecated](npm.package.types.koa-helmet.deprecated.html) — deprecated, `npm.package.types.koa-helmet.deprecated`
- [@types/koa-useragent is deprecated](npm.package.types.koa-useragent.deprecated.html) — deprecated, `npm.package.types.koa-useragent.deprecated`
- [@types/pako is deprecated](npm.package.types.pako.deprecated.html) — deprecated, `npm.package.types.pako.deprecated`
- [@types/react-virtualized-auto-sizer is deprecated](npm.package.types.react-virtualized-auto-sizer.deprecated.html) — deprecated, `npm.package.types.react-virtualized-auto-sizer.deprecated`
- [@types/react-window is deprecated](npm.package.types.react-window.deprecated.html) — deprecated, `npm.package.types.react-window.deprecated`
- [@types/refractor is deprecated](npm.package.types.refractor.deprecated.html) — deprecated, `npm.package.types.refractor.deprecated`
- [@types/sanitize-filename is deprecated](npm.package.types.sanitize-filename.deprecated.html) — deprecated, `npm.package.types.sanitize-filename.deprecated`
- [@types/sequelize is deprecated](npm.package.types.sequelize.deprecated.html) — deprecated, `npm.package.types.sequelize.deprecated`
- [@types/socket.io-client is deprecated](npm.package.types.socket.io-client.deprecated.html) — deprecated, `npm.package.types.socket.io-client.deprecated`
- [uglify-es is deprecated](npm.package.uglify-es.deprecated.html) — deprecated, `npm.package.uglify-es.deprecated`
- [vue2-script-setup-transform is deprecated](npm.package.vue2-script-setup-transform.deprecated.html) — deprecated, `npm.package.vue2-script-setup-transform.deprecated`
- [w3c-hr-time is deprecated](npm.package.w3c-hr-time.deprecated.html) — deprecated, `npm.package.w3c-hr-time.deprecated`

## python

- [agentops-toolkit was renamed and is no longer maintained](python.package.agentops-toolkit.eol.html) — end of life, `python.package.agentops-toolkit.eol`
- [aiohttp-valera-validator was renamed and is no longer maintained](python.package.aiohttp-valera-validator.eol.html) — end of life, `python.package.aiohttp-valera-validator.eol`
- [api-shield is deprecated](python.package.api-shield.deprecated.html) — deprecated, `python.package.api-shield.deprecated`
- [apisec-code-bolt was renamed](python.package.apisec-code-bolt.deprecated.html) — deprecated, `python.package.apisec-code-bolt.deprecated`
- [asyncio-requests is retired](python.package.asyncio-requests.deprecated.html) — deprecated, `python.package.asyncio-requests.deprecated`
- [BatchNotebook is deprecated](python.package.batchnotebook.deprecated.html) — deprecated, `python.package.batchnotebook.deprecated`
- [cmip_ref was renamed and is no longer maintained](python.package.cmip-ref.eol.html) — end of life, `python.package.cmip-ref.eol`
- [datacommons is deprecated](python.package.datacommons.deprecated.html) — deprecated, `python.package.datacommons.deprecated`
- [distribute is deprecated](python.package.distribute.deprecated.html) — deprecated, `python.package.distribute.deprecated`
- [django-celery is no longer required](python.package.django-celery.deprecated.html) — deprecated, `python.package.django-celery.deprecated`
- [django-nose is maintenance-only](python.package.django-nose.maintenance-only.html) — deprecated, `python.package.django-nose.maintenance-only`
- [ghops is deprecated and no longer maintained](python.package.ghops.eol.html) — end of life, `python.package.ghops.eol`
- [goobook is no longer maintained](python.package.goobook.eol.html) — end of life, `python.package.goobook.eol`
- [headroom-cli was renamed and is no longer maintained](python.package.headroom-cli.eol.html) — end of life, `python.package.headroom-cli.eol`
- [imagej was renamed to pyimagej](python.package.imagej.deprecated.html) — deprecated, `python.package.imagej.deprecated`
- [ipaddr is superseded](python.package.ipaddr.deprecated.html) — deprecated, `python.package.ipaddr.deprecated`
- [llama-index-experimental is no longer maintained](python.package.llama-index-experimental.eol.html) — end of life, `python.package.llama-index-experimental.eol`
- [mondobrain is no longer maintained](python.package.mondobrain.eol.html) — end of life, `python.package.mondobrain.eol`
- [multimodal-timesfm is no longer maintained](python.package.multimodal-timesfm.deprecated.html) — deprecated, `python.package.multimodal-timesfm.deprecated`
- [nose is maintenance-only](python.package.nose.maintenance-only.html) — deprecated, `python.package.nose.maintenance-only`
- [opennms-api-wrapper was renamed](python.package.opennms-api-wrapper.deprecated.html) — deprecated, `python.package.opennms-api-wrapper.deprecated`
- [pep8 was renamed to pycodestyle](python.package.pep8.deprecated.html) — deprecated, `python.package.pep8.deprecated`
- [poetry-version-plugin is deprecated](python.package.poetry-version-plugin.deprecated.html) — deprecated, `python.package.poetry-version-plugin.deprecated`
- [PyCrypto is obsolete and vulnerable](python.package.pycrypto.obsolete.html) — end of life, `python.package.pycrypto.obsolete`
- [pyinj is archived on PyPI](python.package.pyinj.archived.html) — end of life, `python.package.pyinj.archived`
- [pytest-runner is deprecated](python.package.pytest-runner.deprecated.html) — deprecated, `python.package.pytest-runner.deprecated`
- [saroku was renamed to trikesh](python.package.saroku.deprecated.html) — deprecated, `python.package.saroku.deprecated`
- [seofleet-cli is deprecated](python.package.seofleet-cli.deprecated.html) — deprecated, `python.package.seofleet-cli.deprecated`
- [sklearn is deprecated on PyPI](python.package.sklearn.deprecated.html) — deprecated, `python.package.sklearn.deprecated`
- [superlinked-server is deprecated](python.package.superlinked-server.deprecated.html) — deprecated, `python.package.superlinked-server.deprecated`
- [superlinked is deprecated for new projects](python.package.superlinked.deprecated.html) — deprecated, `python.package.superlinked.deprecated`
- [vsdeband is deprecated](python.package.vsdeband.deprecated.html) — deprecated, `python.package.vsdeband.deprecated`
- [vsscale is deprecated](python.package.vsscale.deprecated.html) — deprecated, `python.package.vsscale.deprecated`
- [Python 3.10 and older are end-of-life](python.runtime.eol-3.10-and-older.html) — end of life, `python.runtime.eol-3.10-and-older`
- [Python 3.9 and older are end-of-life](python.runtime.eol-3.9-and-older.html) — end of life, `python.runtime.eol-3.9-and-older`

## ruby

- [json 2.17.1.1 is yanked](ruby.gem.json.yanked-2.17.1.1.html) — removed, `ruby.gem.json.yanked-2.17.1.1`
- [Ruby 2.7 is end-of-life](ruby.runtime.eol-2.7.html) — end of life, `ruby.runtime.eol-2.7`
- [Ruby 3.0 is end-of-life](ruby.runtime.eol-3.0.html) — end of life, `ruby.runtime.eol-3.0`
- [Ruby 3.1 is end-of-life](ruby.runtime.eol-3.1.html) — end of life, `ruby.runtime.eol-3.1`
- [Ruby 3.2 is end-of-life](ruby.runtime.eol-3.2.html) — end of life, `ruby.runtime.eol-3.2`

## rust

- [ansi_term is no longer maintained](rust.crate.ansi-term.unmaintained.html) — deprecated, `rust.crate.ansi-term.unmaintained`
- [atty is no longer maintained](rust.crate.atty.unmaintained.html) — deprecated, `rust.crate.atty.unmaintained`
- [failure is no longer maintained](rust.crate.failure.unmaintained.html) — deprecated, `rust.crate.failure.unmaintained`
- [tempdir is no longer maintained](rust.crate.tempdir.unmaintained.html) — deprecated, `rust.crate.tempdir.unmaintained`
- [Rust 1.98 and older are no longer supported](rust.toolchain.end-of-support-1.98-and-older.html) — end of support, `rust.toolchain.end-of-support-1.98-and-older`
