# شروع سریع

این صفحه ترجمهٔ فارسی مسیر شروع کار با Evergreen است. دستورها را همان‌طور که نوشته شده‌اند اجرا کنید؛ خروجی نمونه پس از هر مرحله آمده است.

## ۱. اجرای اولین اسکن

پیش‌نیاز: Node.js نسخهٔ ۲۲ یا جدیدتر. نیازی به نصب نیست:

```bash
npx evergreen-deprecation scan .
```

خروجی، یک خط برای هر یافته با شدت، مکان دقیق فایل و جایگزین پیشنهادی است. اگر مخزن تمیز باشد، `No lifecycle risks found.` چاپ می‌شود. برای خروجی ماشین‌خوان `--json` و برای یک خط خلاصه به ازای هر یافته `--format compact` را اضافه کنید.

## ۲. بررسی یک وابستگی پیش از افزودن

یک بسته یا اکشن را با Package URL بررسی کنید، بدون اسکن مخزن:

```bash
npx evergreen-deprecation check pkg:npm/request@2.88.2
npx evergreen-deprecation check pkg:github/actions/checkout@v4 --json
```

پاسخ `no-data` یعنی Evergreen قاعده‌ای برای این بسته ندارد، نه اینکه سالم است. برای کشف بدون نسخه، `version-dependent` نشان می‌دهد که نتیجه به نسخه بستگی دارد.

## ۳. دیدن شواهد و مسیر مهاجرت

شناسهٔ یک یافته را از خروجی مرحلهٔ ۱ بردارید و جزئیاتش را ببینید:

```bash
npx evergreen-deprecation explain '<finding-id>' .
```

برای دادن زمینهٔ ساختاریافته به یک ایجنت کدنویس:

```bash
npx evergreen-deprecation context '<finding-id>' . --json
```

Evergreen دستورهای تأیید را پیشنهاد می‌دهد و هرگز خودش اجرا نمی‌کند.

## ۴. افزودن به CI

اکشن را در یک workflow قرار دهید تا هر pull request بررسی شود:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v7
  - uses: arminazimi/evergreen@v0.7.1
    with:
      fail-on-severity: high
```

برای مدل تهدید خود می‌توانید به‌جای تگ نسخه، SHA کامل کامیت را پین کنید. راهنمای کامل در [GitHub Action](../../GITHUB_ACTION.md) است.

## ۵. ساختن baseline

یافته‌های موجود و پذیرفته‌شده را ثبت کنید تا گزارش‌های بعدی فقط پس‌رفت‌های جدید را نشان دهند:

```bash
npx evergreen-deprecation baseline .
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json
```

فایل baseline را در مخزن کامیت کنید. یافته‌های baseline به‌طور پیش‌فرض پنهان می‌شوند و با `--on-expired resurface` دوباره ظاهر می‌شوند.

## قدم بعدی

- [README فارسی](README.md)
- [ماتریس سازگاری](../../COMPATIBILITY.md)
- [راهنمای MCP محلی](../../MCP.md)
- [Agent Skill](../../AGENT_SKILLS.md)
