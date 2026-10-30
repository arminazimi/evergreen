---
title: "Is Python end of life? — versions, dates, sources"
description: "Some Python releases are end of life. Python 3.10 and older are end-of-life as of 2026-10-01."
canonical_url: "https://arminazimi.github.io/evergreen/eol/python.html"
---

# Is Python end of life?

**Some Python releases are end of life.** Python 3.10 and older are end-of-life as of 2026-10-01. This page lists 44 reviewed lifecycle rules for `pkg:generic/python`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/python
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Python 3.10 and older are end-of-life](../rules/python.runtime.eol-3.10-and-older.html) | End of life | 2026-10-01 | `vers:pypi/<3.11` | [Status of Python versions](https://devguide.python.org/versions/), [Python release cycle (machine-readable)](https://peps.python.org/api/release-cycle.json), [PEP 619 — Python 3.10 release schedule](https://peps.python.org/pep-0619/) |
| [Python 3.9 and older are end-of-life](../rules/python.runtime.eol-3.9-and-older.html) | End of life | 2025-10-31 | `vers:pypi/<3.10` | [Status of Python versions](https://devguide.python.org/versions/), [PEP 596 — Python 3.9 release schedule](https://peps.python.org/pep-0596/) |
| [Configparser.SafeConfigParser has been removed](../rules/python.symbol.configparser.safeconfigparser.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.cache_from_source has been removed](../rules/python.symbol.imp.cache-from-source.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.find_module has been removed](../rules/python.symbol.imp.find-module.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.get_magic has been removed](../rules/python.symbol.imp.get-magic.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.get_suffixes has been removed](../rules/python.symbol.imp.get-suffixes.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.get_tag has been removed](../rules/python.symbol.imp.get-tag.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.load_module has been removed](../rules/python.symbol.imp.load-module.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.load_source has been removed](../rules/python.symbol.imp.load-source.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.new_module has been removed](../rules/python.symbol.imp.new-module.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.reload has been removed](../rules/python.symbol.imp.reload.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Imp.source_from_cache has been removed](../rules/python.symbol.imp.source-from-cache.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Importlib.util.module_for_loader has been removed](../rules/python.symbol.importlib.util.module-for-loader.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Importlib.util.set_loader has been removed](../rules/python.symbol.importlib.util.set-loader.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Importlib.util.set_package has been removed](../rules/python.symbol.importlib.util.set-package.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Io.OpenWrapper has been removed](../rules/python.symbol.io.openwrapper.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Locale.format has been removed](../rules/python.symbol.locale.format.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Locale.resetlocale has been removed](../rules/python.symbol.locale.resetlocale.html) | Removed | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html) |
| [Sqlite3.enable_shared_cache has been removed](../rules/python.symbol.sqlite3.enable-shared-cache.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Sqlite3.OptimizedUnicode has been removed](../rules/python.symbol.sqlite3.optimizedunicode.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Ssl.match_hostname has been removed](../rules/python.symbol.ssl.match-hostname.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Ssl.RAND_pseudo_bytes has been removed](../rules/python.symbol.ssl.rand-pseudo-bytes.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Ssl.wrap_socket has been removed](../rules/python.symbol.ssl.wrap-socket.html) | Removed | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [unittest.makeSuite, findTestCases and getTestCaseNames have been removed](../rules/python.symbol.unittest.make-suite.html) | Removed | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html), [What's New in Python 3.11](https://docs.python.org/3/whatsnew/3.11.html) |
| [The cafile, capath and cadefault parameters of urllib.request.urlopen have been removed](../rules/python.symbol.urllib.request.urlopen-cafile.html) | Removed | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html) |
| [Webbrowser.MacOSX has been removed](../rules/python.symbol.webbrowser.macosx.html) | Removed | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html) |
| [ast.Num, Str, Bytes, NameConstant and Ellipsis are deprecated](../rules/python.symbol.ast.constant-nodes.html) | Deprecated | The source gives no day | `vers:pypi/>=3.8` | [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html) |
| [asyncio child watcher functions are deprecated](../rules/python.symbol.asyncio.child-watcher.html) | Deprecated | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html), [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html) |
| [asyncio.get_event_loop warns when it has to create a loop](../rules/python.symbol.asyncio.get-event-loop.html) | Deprecated | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Ctypes.SetPointerType is deprecated](../rules/python.symbol.ctypes.setpointertype.html) | Deprecated | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html), [Python deprecations: pending removal in 3.15](https://docs.python.org/3/deprecations/pending-removal-in-3.15.html) |
| [datetime.utcfromtimestamp is deprecated](../rules/python.symbol.datetime.utcfromtimestamp.html) | Deprecated | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html), [datetime documentation](https://docs.python.org/3/library/datetime.html) |
| [datetime.utcnow is deprecated](../rules/python.symbol.datetime.utcnow.html) | Deprecated | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html), [datetime documentation](https://docs.python.org/3/library/datetime.html) |
| [Glob.glob0 and glob.glob1 are deprecated](../rules/python.symbol.glob.glob0.html) | Deprecated | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html) |
| [Http.server.CGIHTTPRequestHandler is deprecated](../rules/python.symbol.http.server.cgihttprequesthandler.html) | Deprecated | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html), [Python deprecations: pending removal in 3.15](https://docs.python.org/3/deprecations/pending-removal-in-3.15.html) |
| [locale.getdefaultlocale is deprecated](../rules/python.symbol.locale.getdefaultlocale.html) | Deprecated | The source gives no day | `vers:pypi/>=3.11` | [What's New in Python 3.11](https://docs.python.org/3/whatsnew/3.11.html) |
| [pkgutil.find_loader and get_loader are deprecated](../rules/python.symbol.pkgutil.find-loader.html) | Deprecated | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html), [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html) |
| [Platform.java_ver is deprecated](../rules/python.symbol.platform.java-ver.html) | Deprecated | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html), [Python deprecations: pending removal in 3.15](https://docs.python.org/3/deprecations/pending-removal-in-3.15.html) |
| [pty.master_open and slave_open are deprecated](../rules/python.symbol.pty.master-open.html) | Deprecated | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html), [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html) |
| [The onerror argument of shutil.rmtree is deprecated](../rules/python.symbol.shutil.rmtree-onerror.html) | Deprecated | The source gives no day | `vers:pypi/>=3.12` | [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) |
| [Sys._enablelegacywindowsfsencoding is deprecated](../rules/python.symbol.sys.enablelegacywindowsfsencoding.html) | Deprecated | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html), [Python deprecations: pending removal in 3.16](https://docs.python.org/3/deprecations/pending-removal-in-3.16.html) |
| [Sysconfig.expand_makefile_vars is deprecated](../rules/python.symbol.sysconfig.expand-makefile-vars.html) | Deprecated | The source gives no day | `vers:pypi/>=3.14` | [Python deprecations: pending removal in 3.16](https://docs.python.org/3/deprecations/pending-removal-in-3.16.html) |
| [Typing.ByteString is deprecated](../rules/python.symbol.typing.bytestring.html) | Deprecated | The source gives no day | `vers:pypi/>=3.9` | [Python deprecations: pending removal in 3.17](https://docs.python.org/3/deprecations/pending-removal-in-3.17.html) |
| [Typing.no_type_check_decorator is deprecated](../rules/python.symbol.typing.no-type-check-decorator.html) | Deprecated | The source gives no day | `vers:pypi/>=3.13` | [What's New in Python 3.13](https://docs.python.org/3/whatsnew/3.13.html), [Python deprecations: pending removal in 3.15](https://docs.python.org/3/deprecations/pending-removal-in-3.15.html) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/python.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/python.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Python end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Python releases are end of life. Python 3.10 and older are end-of-life as of 2026-10-01. This page lists 44 reviewed lifecycle rules for pkg:generic/python, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Python?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/python."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Python dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
