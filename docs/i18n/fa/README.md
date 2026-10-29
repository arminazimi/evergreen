# Evergreen

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-light.png">
    <img alt="Evergreen — Know what breaks next." src="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-light.png" width="100%">
  </picture>
</p>

[![CI](https://img.shields.io/github/actions/workflow/status/arminazimi/evergreen/ci.yml?branch=main&label=CI&logo=github&logoColor=white&labelColor=0C1110&color=2F7D5B&style=flat)](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Farminazimi%2Fevergreen%2Fbadges%2Fcoverage.json&labelColor=0C1110&style=flat)](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/evergreen-deprecation.svg?logo=npm&logoColor=white&labelColor=0C1110&color=2F7D5B&style=flat)](https://www.npmjs.com/package/evergreen-deprecation)
[![Evergreen](https://raw.githubusercontent.com/arminazimi/evergreen/badges/evergreen-badge.svg)](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml)
[![skills.sh](https://skills.sh/b/arminazimi/evergreen)](https://skills.sh/arminazimi/evergreen/evergreen-deprecation)

این صفحه ترجمهٔ فارسی [README اصلی](../../../README.md) است. زبان‌های دیگر: **فارسی** · [English](../../../README.md)

Evergreen ریسک‌های **پایان پشتیبانی (EOL) و منسوخ‌شدن** رانتایم‌ها، بسته‌ها و اکشن‌های گیت‌هاب را در مخزن شما پیدا می‌کند، فایل و خط دقیق را نشان می‌دهد و هر یافته را به یک منبع معتبر، یک جایگزین و مراحل مهاجرت متصل می‌کند. به‌صورت CLI روی ماشین شما، سرور MCP محلی، GitHub Action (با SARIF برای code scanning) و Agent Skill اجرا می‌شود؛ پس انسان‌ها و ایجنت‌های کدنویس می‌توانند ریسک چرخهٔ عمر را پیش از شکستن بیلد پیدا کنند و پیش از افزودن یک وابستگی آن را بررسی کنند. اسکن‌ها قطعی و آفلاین‌اند و به حساب کاربری نیاز ندارند.

[مستندات عمومی](https://arminazimi.github.io/evergreen/) را بخوانید، [دموی ۹۰ ثانیه‌ای](../../../docs/DEMO.md) را اجرا کنید، یا [گزارش اعتبارسنجی](../../../docs/VALIDATION.md) را ببینید. برای ابزارهای هوش مصنوعی، مستندات به‌صورت [`llms.txt`](https://arminazimi.github.io/evergreen/llms.txt) و [`llms-full.txt`](https://arminazimi.github.io/evergreen/llms-full.txt) هم منتشر می‌شوند.

## چه چیزهایی را پوشش می‌دهد

| اکوسیستم | چه چیزی را می‌خواند | چه چیزی را گزارش می‌کند |
| --- | --- | --- |
| **ایمیج‌های پایهٔ کانتینر** *(آزمایشی)* | `Dockerfile`، `*.Dockerfile`، `Containerfile`، `compose.yaml`، `docker-compose.yml`: ایمیج‌های پایهٔ رسمی `node`، `python`، `postgres`، `mysql` و `ruby` | خط‌های انتشار ایمیج که به پایان عمر رسیده‌اند. متغیرها، `latest` و تگ‌های شناور به‌عنوان طبقه‌بندی‌نشده فهرست می‌شوند و هرگز حدس زده نمی‌شوند. [ایمیج‌های پایهٔ کانتینر](../../../docs/detectors/container.md) |
| **.NET** *(بتا)* | `global.json`، `*.csproj`/`*.fsproj`/`*.vbproj`، `Directory.Build.props`، `Directory.Packages.props`، `packages.lock.json`: SDK پین‌شده، target frameworkها و بسته‌های مستقیم NuGet | خط‌های انتشار .NET پس از پایان پشتیبانی و بسته‌های مستقیمی که ناشرشان منسوخ کرده است، همراه با فایل‌های C# که از آن‌ها استفاده می‌کنند. .NET Framework، `netstandard`، ویژگی‌های MSBuild، نسخه‌های شناور و بازه‌ها داوری نمی‌شوند. [.NET](../../../docs/detectors/dotnet.md) |
| **Go** *(آزمایشی)* | `go.mod` و `go.work`: دستورهای `go` و `toolchain` و ورودی‌های مستقیم `require` | خط‌های انتشار Go که دیگر وصله نمی‌گیرند و ماژول‌های مستقیم دارای قاعدهٔ چرخهٔ عمر. نسخه‌هایی که Evergreen نمی‌تواند بخواند طبقه‌بندی‌نشده فهرست می‌شوند. [Go](../../../docs/detectors/go.md) |
| **GitHub Actions** | `.github/workflows/*.yml`: ارجاع‌های `uses:` به اکشن‌ها، از جمله پین‌های SHA کامل که از طریق کامنت نسخه یا نقشهٔ انتشار همراه resolve می‌شوند | اکشن‌هایی که روی رانتایم‌های بازنشسته (مثل Node.js 20) یا majorهای بازنشسته/منسوخ اجرا می‌شوند، در خط دقیق |
| **C و C++** *(آزمایشی)* | `CMakeLists.txt`، `conanfile.txt`، `conanfile.py` و `vcpkg.json` | حذف‌ها و منسوخ‌شدن‌های سازگاری سیاست CMake، در اعلان دقیق. سایر اعلان‌ها به قاعدهٔ بازبینی‌شدهٔ منطبق نیاز دارند. [C و C++](../../../docs/COMPATIBILITY.md#c-and-c-detector) |
| **ایمیج‌های runner CI** *(آزمایشی)* | `image` و `services` در `.gitlab-ci.yml`، `docker.image`، `machine.image` و orbها در `.circleci/config.yml`، و `pool.vmImage` در `azure-pipelines.yml` | برچسب‌های ایمیج میزبان Azure که قاعدهٔ بازبینی‌شده پوشش می‌دهد، در خط دقیق. ایمیج‌های GitLab، orbهای CircleCI، متغیرها و aliasهای شناور طبقه‌بندی‌نشده‌اند. ایمیج literal در CircleCI داوری نمی‌شود. [ایمیج‌های runner CI](../../../docs/COMPATIBILITY.md#ci-runner-images-detector) |
| **Java و Kotlin (JVM)** *(بتا)* | `pom.xml`، `build.gradle`، `build.gradle.kts`، `.java-version`، `.sdkmanrc`، `.tool-versions`: JDKی که پروژه پین یا target می‌کند و وابستگی‌های مستقیم Maven. [Java و Kotlin](../../../docs/detectors/java.md) | نسخه‌های feature JDK که از پشتیبانی خارج شده‌اند و وابستگی‌هایی که POM آن‌ها می‌گوید جابه‌جا شده‌اند. ارجاع‌های property و عبارت‌ها طبقه‌بندی‌نشده فهرست می‌شوند |
| **APIهای Kubernetes** *(بتا)* | مانیفست‌های `*.yaml` و `*.yml`، پوشهٔ `templates/` چارت Helm و `kustomization.yaml`: `apiVersion` و `kind` literal و patchهای kustomize. [APIهای Kubernetes](../../../docs/detectors/kubernetes.md) | نسخه‌های API که پروژهٔ Kubernetes می‌گوید دیگر سرو نمی‌شوند. valueهای Helm، قالب‌های محافظت‌شده با کلاستر و هر چیزی که literal خوانده نشود رد می‌شود |
| **Node.js** | `engines.node`، `volta`، `.nvmrc`، `.node-version` | نسخه‌های رانتایمی که به پایان عمر یا پایان پشتیبانی رسیده‌اند |
| **npm** | وابستگی‌های `package.json`، `package-lock.json`، `npm-shrinkwrap.json`، `yarn.lock`، `pnpm-lock.yaml` و importها و فراخوانی‌هایی که از هر بسته استفاده می‌کنند | بسته‌های منسوخ یا بدون نگهدارنده، همراه با جایگزین و محل استفادهٔ بسته |
| **Python** | `pyproject.toml`، `requirements*.txt`، `.python-version`، `runtime.txt`، `.tool-versions`، `poetry.lock`، `uv.lock`، `Pipfile.lock` | نسخه‌های Python که به پایان عمر رسیده‌اند و بسته‌های منسوخ یا منقضی |
| **Dart و Flutter** *(آزمایشی)* | `pubspec.yaml`، `pubspec.lock`، `.fvmrc`، `.fvm/fvm_config.json`: قیدهای SDK، وابستگی‌های مستقیم، بسته‌های resolveشده و نسخهٔ Flutter پین‌شده | خط‌های انتشار Dart SDK که با پین دقیق دیگر به‌روزرسانی امنیتی نمی‌گیرند و بسته‌های pub متوقف‌شده همراه با فایل‌هایی که استفاده می‌کنند. بازه‌های قید مثل `>=3.8.0 <4.0.0` داوری نمی‌شوند. [Dart و Flutter](../../../docs/detectors/dart.md) |
| **رانتیما‌ی دیتابیس** *(آزمایشی)* | تگ‌های ایمیج در `compose.yaml` / `docker-compose.yml` (`postgres`، `mysql`، `mariadb`، `redis`، `mongo`) و `engine_version` روی منابع دیتابیس مدیریت‌شدهٔ AWS در `*.tf` | PostgreSQL 11–13 و MySQL 5.7 و 8.0 پس از پایان عمر. تگ‌های شناور، متغیرها، بلوک‌های module و فایل‌های Compose دارای YAML alias داوری نمی‌شوند. [رانتیما‌ی دیتابیس](../../../docs/detectors/database.md) |
| **Shell و PowerShell** *(آزمایشی)* | `#Requires -Version` در `*.ps1` / `*.psm1`، `PowerShellVersion` در `*.psd1` و تگ‌های پین‌شدهٔ ایمیج `mcr.microsoft.com/powershell` در `.github/workflows` | PowerShell 6.x و 7.0–7.3 پس از پایان پشتیبانی. Windows PowerShell 5.1، نام shellها، ایمیج‌های Bash، مقادیر پویا و دستورهای دارای گزینهٔ اضافه داوری نمی‌شوند. [Shell و PowerShell](../../../docs/detectors/shell.md) |
| **Terraform** *(آزمایشی)* | `*.tf` (`required_version`، `required_providers`)، `.terraform.lock.hcl`، `.terraform-version`، `.tool-versions`: قیدها، providerهای قفل‌شده و CLI پین‌شدهٔ Terraform | خط‌های انتشار Terraform CLI که با پین دقیق یا قید `~> X.Y.Z` دیگر پشتیبانی نمی‌شوند. بازه‌هایی مثل `>= 1.5` داوری نمی‌شوند. [Terraform](../../../docs/detectors/terraform.md) |
| **Rust** *(آزمایشی)* | `Cargo.toml`، `Cargo.lock`، `rust-toolchain(.toml)`: toolchain پین‌شده و وابستگی‌های مستقیم crate | toolchainهای قدیمی‌تر از آخرین نسخهٔ stable و وابستگی‌های مستقیم به crateهای بدون نگهدارنده، همراه با فایل‌هایی که استفاده می‌کنند. `edition`، `rust-version`، `stable` و هر چیزی که literal خوانده نشود داوری نمی‌شوند. [Rust](../../../docs/detectors/rust.md) |
| **Swift** *(بتا)* | `.swift-version`، `.xcode-version`، `Package.swift`، `Package.resolved` و `IPHONEOS_DEPLOYMENT_TARGET` هدف اپلیکیشن در `project.pbxproj` | نسخه‌های Xcode و iOS که App Store Connect دیگر نمی‌پذیرد، خط‌های toolchain Swift دارای قاعدهٔ چرخهٔ عمر و بسته‌های دارای قاعده. کتابخانه‌ها و حداقل‌های `platforms:` داوری نمی‌شوند. [Swift](../../../docs/detectors/swift.md) |
| **رانتیما‌ی serverless** *(بتا)* | `Runtime` در قالب‌های AWS SAM و CloudFormation، `provider.runtime` و `runtime` در `serverless.yml` و `runtime` در Terraform `aws_lambda_function`، Google Cloud Functions و اپ‌های تابع Azure | رانتایم‌های Lambda و Cloud Functions که فروشنده‌شان پایان عمر اعلام کرده است. [رانتیما‌ی serverless](../../../docs/detectors/serverless.md) |
| **Ruby** *(آزمایشی)* | `.ruby-version`، `.tool-versions`، `Gemfile`، `Gemfile.lock` | خط‌های انتشار Ruby پس از پایان پشتیبانی و gemهای yankشده، همراه با فایل‌های Rubyی که از gem استفاده می‌کنند. [سازگاری](../../../docs/COMPATIBILITY.md#ruby-detector) |
| **PHP** *(آزمایشی)* | `.php-version`، `.tool-versions`، `composer.json`، `composer.lock` | خط‌های انتشار PHP پس از پایان پشتیبانی و بسته‌های رهاشدهٔ Composer. [سازگاری](../../../docs/COMPATIBILITY.md#php-detector) |
| **Android** *(آزمایشی)* | `build.gradle(.kts)`، `settings.gradle(.kts)`، `libs.versions.toml`: سطوح SDK، Android Gradle Plugin، پلاگین Kotlin و وابستگی‌های Maven | اعلان‌هایی که قاعدهٔ بازبینی‌شده نام می‌برد، مثل majorهای ۵ تا ۹ کتابخانهٔ Google Play Billing. [سازگاری](../../../docs/COMPATIBILITY.md#android-detector) |

سطح داخل پرانتز بلوغ detector است؛ فهرست کامل هر سطح در [ماتریس پوشش اکوسیستم‌ها](../../../docs/COMPATIBILITY.md#ecosystem-coverage) و precision و recall کسب‌شدهٔ هر detector در [داشبورد دقت](https://arminazimi.github.io/evergreen/dashboard/) است. هر یافته منابع قاعده، تاریخ بازبینی و مراحل مهاجرت را همراه دارد؛ [قواعد چرخهٔ عمر](../../../docs/RULES.md) را ببینید. برای اکوسیستم‌های دیگر حدس زده نمی‌شود: Evergreen بسته‌ای را که قاعده‌ای برایش ندارد `no-data` گزارش می‌کند، نه سالم، و اکوسیستم‌های جدید از [اسکلت detector تولیدشده](../../../docs/DETECTORS.md#start-a-new-detector-in-this-repository) شروع می‌شوند. [ماتریس سازگاری](../../../docs/COMPATIBILITY.md) محیط‌ها و میزبان‌های پشتیبانی‌شده را فهرست می‌کند.

## اصول محصول

- Local-first: کد منبع روی ماشین شما یا runner CI می‌ماند.
- هستهٔ قطعی: یافته‌ها به LLM نیاز ندارند.
- مبتنی بر شواهد: هر ادعای منسوخ‌شدن به منبع معتبر پیوند دارد.
- آماده برای ایجنت: هر گزارش انسانی معادل ماشین‌خوان دارد.
- قابل توسعه: اکوسیستم‌ها با detector اضافه می‌شوند، نه با بازنویسی هسته.

## شروع سریع

پیش‌نیاز: Node.js نسخهٔ ۲۲ یا جدیدتر.

```bash
npx evergreen-deprecation scan .
```

به‌جای گزارش کامل، یک پاسخ کوتاه به ایجنت بدهید: یک خط برای هر یافته با شناسه، مکان، شدت و جایگزین، از شدیدترین شروع، حداکثر ۲۵ یافته (بقیه شمرده می‌شوند) و کمتر از ۸ کیلوبایت:

```bash
npx evergreen-deprecation scan . --format compact
```

بررسی کنید که CLI، سرور MCP محلی، Agent Skill، پایه‌های پلاگین و فضای کاری CI آماده‌اند، بدون تغییر پیکربندی یا آپلود دادهٔ مخزن:

```bash
npx evergreen-deprecation doctor .
npx evergreen-deprecation doctor . --json
```

[ماتریس سازگاری عمومی](../../../docs/COMPATIBILITY.md) را برای ترکیب‌های پشتیبانی‌شده، آزمایشی و پشتیبانی‌نشده ببینید.

قابلیت‌ها و ورودی‌های نسخه‌بندی‌شدهٔ Evergreen را به‌صورت برنامه‌نویسی کشف کنید:

```bash
npx evergreen-deprecation capabilities --json
```

[قرارداد خودکشفی](../../../docs/CAPABILITIES.md) شناسه‌های مشترکی را تعریف می‌کند که CLI، سرور MCP، Agent Skill، پلاگین‌ها و یکپارچه‌سازی‌های CI استفاده می‌کنند.

برای یافته‌های موجودِ پذیرفته‌شده یک baseline بسازید و سپس فقط پس‌رفت‌های جدید چرخهٔ عمر را گزارش کنید:

```bash
npx evergreen-deprecation baseline .
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json
```

یک وابستگی را پیش از افزودن بررسی کنید، بدون اسکن کل مخزن:

```bash
npx evergreen-deprecation check pkg:npm/request@2.88.2
npx evergreen-deprecation check pkg:github/actions/checkout@v4 --json
```

دستور مشکل چرخهٔ عمر، جایگزین و شواهد را چاپ می‌کند و وقتی قاعده‌ای در سطح `--fail-on` (پیش‌فرض `high`) یا بالاتر اعمال شود با کد `1`، در غیر این صورت با `0`، برای خط فرمان اشتباه با `2` و برای Package URL غیرقابل‌تجزیه با `4` خارج می‌شود ([کدهای خروج](../../../docs/CAPABILITIES.md#exit-codes-and-error-codes)). بسته‌ای که Evergreen قاعده‌ای برایش ندارد `no-data` گزارش می‌کند که ادعای سالم بودن نیست. بدون نسخه، بسته‌ای که قواعدش فقط بخشی از نسخه‌ها را پوشش می‌دهد `version-dependent` گزارش می‌شود؛ برای پاسخ قطعی نسخه را اضافه کنید.

قواعد چرخهٔ عمر را می‌توان بین انتشارها از بسته‌های امضاشده به‌روز کرد و اسکن‌ها آفلاین می‌مانند مگر اینکه خودتان بخواهید:

```bash
npx evergreen-deprecation data status
npx evergreen-deprecation data update
```

[دادهٔ چرخهٔ عمر](../../../docs/DATA.md) را برای مدل امضا و اعتماد، پین کردن و آنچه هنگام ناموفق بودن تأیید دانلود رخ می‌دهد ببینید.

شواهد و جهت مهاجرت یک نتیجه را بررسی کنید:

```bash
npx evergreen-deprecation explain '<finding-id>' .
```

زمینهٔ مهاجرت قابل حمل برای انسان یا ایجنت کدنویس بسازید:

```bash
npx evergreen-deprecation context '<finding-id>' . --json
```

بسته‌های مهاجرت شامل قیدها و مراحل مخصوص قاعده، فایل‌ها و استفاده‌های دقیق متأثر، منابع معتبر و دستورهای تأیید پیشنهادی‌اند. Evergreen هرگز آن دستورها را خودکار اجرا نمی‌کند. [راهنمای بستهٔ مهاجرت](../../../docs/MIGRATION_PACKETS.md) را ببینید.

به ایجنت‌های کدنویسِ مخزن بگویید وابستگی‌ها را پیش از افزودن بررسی کنند. این کار یک بخش مشخص‌شده در `AGENTS.md` (یا اگر فایل شما `CLAUDE.md` است، همان) اضافه یا تازه می‌کند؛ اجرای دوباره چیزی را تغییر نمی‌دهد و بیرون از نشانه‌ها دست نمی‌زند:

```bash
npx evergreen-deprecation init --agents --dry-run   # show the change
npx evergreen-deprecation init --agents
```

برای انجام این کار برای همهٔ ایجنت‌های کدنویسی که مخزن برایشان پیکربندی شده، `setup` را اجرا کنید. این دستور پیکربندی Claude Code، Codex، Cursor، Gemini CLI، GitHub Copilot و Kilo Code را تشخیص می‌دهد، تغییر هر فایل دستور میزبان را نشان می‌دهد و فقط پس از تأیید (یا با `--yes`) می‌نویسد. از همان بخش نشانه‌گذاری‌شدهٔ `init --agents` استفاده می‌کند، پس قواعد موجود هرگز بازنویسی نمی‌شوند:

```bash
npx evergreen-deprecation setup --dry-run   # print the plan
npx evergreen-deprecation setup             # ask, then write
npx evergreen-deprecation setup --yes       # no prompt (CI, scripts)
```

یک ایجنت کدنویس را از طریق سرور MCP محلی وصل کنید:

```bash
npx --yes --package evergreen-deprecation evergreen-mcp
```

سرور stdio این ابزارها را ارائه می‌دهد: `scan_repository`، `list_deprecations`، `explain_deprecation`، `create_migration_context`، `verify_migration` و `check_dependency` (بررسی یک بسته پیش از افزودن). [راهنمای MCP محلی](../../../docs/MCP.md) را برای پیکربندی میزبان، جریان کاری موردنظر و تضمین‌های حریم خصوصی ببینید.

## Agent Skill

Agent Skill مستقل از فروشنده را از مونوریپو نصب کنید:

```bash
npx skills add arminazimi/evergreen
```

نسخه‌های بعدی را با این دستور بگیرید:

```bash
npx skills update evergreen-deprecation
```

Skill [`evergreen-deprecation`](../../../skills/evergreen-deprecation/README.md) کشف، توضیح، مهاجرت و تأیید را آموزش می‌دهد و منطق تشخیص و مهاجرت را داخل Evergreen نگه می‌دارد. در [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation) قابل کشف است و نصبش برای Codex، Claude Code، Cursor، GitHub Copilot و Gemini CLI اعتبارسنجی شده است. [راهنمای Agent Skill](../../../docs/AGENT_SKILLS.md) را برای ارزیابی، سازگاری، محدودیت‌ها و فرض‌های امنیتی ببینید.

بسته‌های پلاگین Codex و Claude از همان Skill و جریان MCP تولید می‌شوند. [معماری بسته‌بندی](../../../docs/PLUGIN_PACKAGING.md) مانیفست‌های میزبان را نازک نگه می‌دارد و وقتی هر بسته از منابع مرجع منحرف شود CI را شکست می‌دهد.
[ارزیابی چندمیزبانه](../../../docs/PLUGIN_EVALS.md) نتایج پیکرهٔ مشترک، بودجهٔ زمینه، رفتار مجوزها و محدودیت‌های امنیتی را منتشر می‌کند؛ همان بررسی‌ها پس‌رفت‌های انتشار را در `npm run check` مسدود می‌کنند.

Evergreen محلی اجرا می‌شود و محتوای مخزن را آپلود نمی‌کند. اینکه کدام دستورها فایل‌سیستم، محیط، فرایندها یا شبکه را می‌خوانند در جدول [دسترسی دستور و سطح](../../../docs/PRIVACY.md#command-and-surface-access) آمده است (خلاصه در [SECURITY.md](../../../SECURITY.md#trust-model)).

## توسعه

```bash
npm install
npm run check
```

detector اولیه نسخه‌های major پشتیبانی‌نشدهٔ پنج اکشن first-party را با مکان دقیق فایل و خط گزارش می‌کند:

- `actions/checkout`
- `actions/setup-node`
- `actions/cache`
- `actions/upload-artifact`
- `actions/download-artifact`

SHAهای کامیت پین‌شده و عبارت‌های پویا عمداً طبقه‌بندی‌نشده می‌مانند تا Evergreen بتواند بدون حدس آن‌ها را resolve کند.

detector npm هم `package.json`، lockfileهای npm/pnpm/Yarn، اعلان‌های رانتایم Node.js و یک registry کوچکِ مبتنی بر شواهد از وابستگی‌های مستقیم منسوخ را می‌خواند. برای بررسی یک یافته و منابعش از `evergreen explain <finding-id>` استفاده کنید. اگر یافته‌ای اشتباه است، `evergreen report-issue <finding-id>` یک گزارش Markdown با قاعده، شواهد و چند خط پاک‌سازی‌شده از فایل اعلان چاپ می‌کند و هرگز issue باز نمی‌کند یا از شبکه استفاده نمی‌کند.

detector Python متادیتای PEP 621 و Poetry را از `pyproject.toml`، `requirements*.txt`، فایل‌های رایج نسخهٔ رانتایم و lockfileهای uv/Poetry/PDM/Pipenv می‌خواند. اعلان‌های پشتیبانی‌نشدهٔ Python و ریسک‌های چرخهٔ عمر وابستگی‌های مستقیم را گزارش می‌کند و ورودی‌های lockfile صرفاً گذرا را نادیده می‌گیرد.

## تحلیل استفادهٔ منبع

یافته‌های چرخهٔ عمر بسته حالا importها، فراخوانی‌ها و کلیدهای پیکربندی مشخصی را شامل می‌شوند که مهاجرت را ضروری می‌کنند. تطبیق برای JavaScript، TypeScript و Python زبان‌آگاه و aliasآگاه است و کلیدهای پیکربندی برای JSON، YAML، TOML، INI و تنظیمات Python پشتیبانی می‌شوند. هر تطبیق فایل، خط، ستون و excerpt منبع دقیق خود را دارد، به‌همراه برآورد اثر مهاجرت بر اساس استفاده‌ها و فایل‌های متأثر.

تحلیل‌گر مخزن را یک بار برای مجموعه‌ای از قراردادهای detector اسکن می‌کند و پوشه‌های generated، dependency، build و environment را نادیده می‌گیرد. بنچمارک تکرارپذیر دقت و زمان اسکن را با این دستور اجرا کنید:

```bash
npm run benchmark:usage
```

برای پیکره و تفسیر، [یادداشت‌های بنچمارک](../../../docs/BENCHMARKS.md) را ببینید.

## GitHub Action

Evergreen می‌تواند pull requestها را annotate کند، یافته‌های پذیرفته‌شده را با baseline سرکوب کند، روی شدت انتخابی fail شود و گزارش کامل JSON را آپلود کند:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v7
  - uses: arminazimi/evergreen@v0.7.1
    with:
      baseline: .evergreen-baseline.json
      fail-on-severity: high
```

وقتی مدل تهدید شما ارجاع‌های تغییرناپذیر اکشن شخص ثالث می‌خواهد، به‌جای تگ نسخه یک SHA کامل کامیت پین کنید. برای راه‌اندازی، ورودی‌ها، مجوزها، artifactها و مرزهای حریم خصوصی [راهنمای GitHub Action](../../../docs/GITHUB_ACTION.md) را ببینید.

## Detector SDK

detectorهای خارجی می‌توانند از رابط نسخه‌بندی‌شدهٔ صادرشده توسط `evergreen-deprecation/sdk` استفاده کنند. موتور اسکن detectorهای سازگار را بدون import کردن هیچ پیاده‌سازی داخلی ترکیب می‌کند.

[راهنمای نوشتن detector](../../../docs/DETECTORS.md) و [نمونهٔ حداقلی detector](../../../examples/detectors/todo-comments.ts) را ببینید.

## شکل اولیهٔ محصول

CLI محصول است. detectorها آن را گسترش می‌دهند، GitHub Actions آن را خودکار می‌کنند و سرور MCP محلی آن را به ایجنت‌ها ارائه می‌دهد. بک‌اند میزبانی‌شده عمداً بیرون از نقشهٔ راه است؛ دادهٔ چرخهٔ عمر در عوض از طریق یک کانال دادهٔ امضاشده و قابل تأیید آفلاین به‌روز می‌شود.

[نقشهٔ راه](../../../docs/ROADMAP.md)، [معماری](../../../docs/ARCHITECTURE.md)، [راهنمای برند](../../../brand/BRAND_GUIDE.md) و [راهنمای مشارکت](../../../CONTRIBUTING.md) را ببینید.

## جامعه

سؤال‌ها، ایده‌ها و چیزهایی که با Evergreen ساخته‌اید جایشان در [GitHub Discussions](https://github.com/arminazimi/evergreen/discussions) است: برای پرسیدن **Q&A**، برای پیشنهاد **Ideas** و برای به‌اشتراک‌گذاشتن **Show and tell**. برای باگ‌ها، درخواست قاعدهٔ چرخهٔ عمر و درخواست اکوسیستم از issue استفاده کنید.

## مجوز و برند

کد منبع Evergreen تحت [Apache License 2.0](../../../LICENSE) مجوز دارد. نام، لوگو و فایل‌های Evergreen در [`brand/`](../../../brand/) دارایی‌های برند اختصاصی‌اند و [شرایط دارایی برند](../../../brand/LICENSE.md) جداگانه شامل آن‌ها می‌شود.
