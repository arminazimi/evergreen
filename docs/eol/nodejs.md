---
title: "Is Node.js end of life? — versions, dates, sources"
description: "Some Node.js releases are end of life. Node.js 25 is end-of-life as of 2026-06-01. This page lists 80 reviewed lifecycle rules for pkg:generic/nodejs, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/nodejs.html"
---

# Is Node.js end of life?

**Some Node.js releases are end of life.** Node.js 25 is end-of-life as of 2026-06-01. This page lists 80 reviewed lifecycle rules for `pkg:generic/nodejs`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Node.js 25 is end-of-life](../rules/nodejs.runtime.eol-25.html) | End of life | 2026-06-01 | `vers:semver/>=25.0.0\|<26.0.0` | [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [Node.js 20 is end-of-life](../rules/nodejs.runtime.eol-20.html) | End of life | 2026-04-30 | `vers:semver/>=20.0.0\|<21.0.0` | [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [Node.js 23 is end-of-life](../rules/nodejs.runtime.eol-23.html) | End of life | 2025-06-01 | `vers:semver/>=23.0.0\|<24.0.0` | [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [Node.js 18 is end-of-life](../rules/nodejs.runtime.eol-18.html) | End of life | 2025-04-30 | `vers:semver/>=18.0.0\|<19.0.0` | [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [Node.js 21 is end-of-life](../rules/nodejs.runtime.eol-21.html) | End of life | 2024-06-01 | `vers:semver/>=21.0.0\|<22.0.0` | [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [Node.js 19 is end-of-life](../rules/nodejs.runtime.eol-19.html) | End of life | 2023-06-01 | `vers:semver/>=19.0.0\|<20.0.0` | [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [Legacy Node.js runtime is end-of-life](../rules/nodejs.runtime.legacy.html) | End of life | The source gives no day | `vers:semver/<18.0.0` | [Node.js end-of-life releases](https://nodejs.org/en/about/eol) |
| [Assert.CallTracker has been removed](../rules/nodejs.symbol.assert.calltracker.html) | Removed | The source gives no day | `vers:semver/>=25.0.0` | [Node.js deprecations: DEP0173](https://nodejs.org/api/deprecations.html) |
| [Async_hooks.currentId has been removed](../rules/nodejs.symbol.async-hooks.currentid.html) | Removed | The source gives no day | `vers:semver/>=9.0.0` | [Node.js deprecations: DEP0070](https://nodejs.org/api/deprecations.html) |
| [Async_hooks.triggerId has been removed](../rules/nodejs.symbol.async-hooks.triggerid.html) | Removed | The source gives no day | `vers:semver/>=9.0.0` | [Node.js deprecations: DEP0071](https://nodejs.org/api/deprecations.html) |
| [The customFds option of child_process has been removed](../rules/nodejs.symbol.child-process.customfds.html) | Removed | The source gives no day | `vers:semver/>=12.0.0` | [Node.js deprecations: DEP0006](https://nodejs.org/api/deprecations.html) |
| [crypto.createCipher and createDecipher have been removed](../rules/nodejs.symbol.crypto.createcipher.html) | Removed | The source gives no day | `vers:semver/>=22.0.0` | [Node.js deprecations: DEP0106 crypto.createCipher](https://nodejs.org/api/deprecations.html) |
| [Crypto.createCredentials has been removed](../rules/nodejs.symbol.crypto.createcredentials.html) | Removed | The source gives no day | `vers:semver/>=11.0.0` | [Node.js deprecations: DEP0010](https://nodejs.org/api/deprecations.html) |
| [Crypto.Credentials has been removed](../rules/nodejs.symbol.crypto.credentials.html) | Removed | The source gives no day | `vers:semver/>=11.0.0` | [Node.js deprecations: DEP0011](https://nodejs.org/api/deprecations.html) |
| [Crypto.DEFAULT_ENCODING has been removed](../rules/nodejs.symbol.crypto.default-encoding.html) | Removed | The source gives no day | `vers:semver/>=20.0.0` | [Node.js deprecations: DEP0091](https://nodejs.org/api/deprecations.html) |
| [The hash and mgf1Hash options of RSA-PSS key generation have been removed](../rules/nodejs.symbol.crypto.rsa-pss-options.html) | Removed | The source gives no day | `vers:semver/>=25.0.0` | [Node.js deprecations: DEP0154](https://nodejs.org/api/deprecations.html) |
| [Fs.F_OK, fs.R_OK, fs.W_OK and fs.X_OK have been removed](../rules/nodejs.symbol.fs.access-constants.html) | Removed | The source gives no day | `vers:semver/>=25.0.0` | [Node.js deprecations: DEP0176](https://nodejs.org/api/deprecations.html) |
| [The recursive option of fs.rmdir has been removed](../rules/nodejs.symbol.fs.rmdir-recursive.html) | Removed | The source gives no day | `vers:semver/>=25.0.0` | [Node.js deprecations: DEP0147 fs.rmdir recursive](https://nodejs.org/api/deprecations.html) |
| [Intl.v8BreakIterator has been removed](../rules/nodejs.symbol.intl.v8breakiterator.html) | Removed | The source gives no day | `vers:semver/>=9.0.0` | [Node.js deprecations: DEP0017](https://nodejs.org/api/deprecations.html) |
| [Module.createRequireFromPath has been removed](../rules/nodejs.symbol.module.createrequirefrompath.html) | Removed | The source gives no day | `vers:semver/>=16.0.0` | [Node.js deprecations: DEP0130](https://nodejs.org/api/deprecations.html) |
| [Net._setSimultaneousAccepts has been removed](../rules/nodejs.symbol.net.setsimultaneousaccepts.html) | Removed | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0121](https://nodejs.org/api/deprecations.html) |
| [Os.getNetworkInterfaces has been removed](../rules/nodejs.symbol.os.getnetworkinterfaces.html) | Removed | The source gives no day | `vers:semver/>=12.0.0` | [Node.js deprecations: DEP0023](https://nodejs.org/api/deprecations.html) |
| [Os.tmpDir has been removed](../rules/nodejs.symbol.os.tmpdir.html) | Removed | The source gives no day | `vers:semver/>=14.0.0` | [Node.js deprecations: DEP0022](https://nodejs.org/api/deprecations.html) |
| [Process.assert has been removed](../rules/nodejs.symbol.process.assert.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0100](https://nodejs.org/api/deprecations.html) |
| [SlowBuffer has been removed](../rules/nodejs.symbol.slowbuffer.html) | Removed | The source gives no day | `vers:semver/>=25.0.0` | [Node.js deprecations: DEP0030](https://nodejs.org/api/deprecations.html) |
| [Timers.active has been removed](../rules/nodejs.symbol.timers.active.html) | Removed | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0126](https://nodejs.org/api/deprecations.html) |
| [Timers.enroll has been removed](../rules/nodejs.symbol.timers.enroll.html) | Removed | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0095](https://nodejs.org/api/deprecations.html) |
| [Timers.unenroll has been removed](../rules/nodejs.symbol.timers.unenroll.html) | Removed | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0096](https://nodejs.org/api/deprecations.html) |
| [Timers._unrefActive has been removed](../rules/nodejs.symbol.timers.unrefactive.html) | Removed | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0127](https://nodejs.org/api/deprecations.html) |
| [Tls.convertNPNProtocols has been removed](../rules/nodejs.symbol.tls.convertnpnprotocols.html) | Removed | The source gives no day | `vers:semver/>=11.0.0` | [Node.js deprecations: DEP0107](https://nodejs.org/api/deprecations.html) |
| [tls.createSecurePair has been removed](../rules/nodejs.symbol.tls.createsecurepair.html) | Removed | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0064 tls.createSecurePair](https://nodejs.org/api/deprecations.html) |
| [Tls.CryptoStream has been removed](../rules/nodejs.symbol.tls.cryptostream.html) | Removed | The source gives no day | `vers:semver/>=10.0.0` | [Node.js deprecations: DEP0042](https://nodejs.org/api/deprecations.html) |
| [Tls.parseCertString has been removed](../rules/nodejs.symbol.tls.parsecertstring.html) | Removed | The source gives no day | `vers:semver/>=18.0.0` | [Node.js deprecations: DEP0076](https://nodejs.org/api/deprecations.html) |
| [Tls.SecurePair has been removed](../rules/nodejs.symbol.tls.securepair.html) | Removed | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0043](https://nodejs.org/api/deprecations.html) |
| [Util.debug has been removed](../rules/nodejs.symbol.util.debug.html) | Removed | The source gives no day | `vers:semver/>=12.0.0` | [Node.js deprecations: DEP0028](https://nodejs.org/api/deprecations.html) |
| [Util.error has been removed](../rules/nodejs.symbol.util.error.html) | Removed | The source gives no day | `vers:semver/>=12.0.0` | [Node.js deprecations: DEP0029](https://nodejs.org/api/deprecations.html) |
| [Util.isBoolean has been removed](../rules/nodejs.symbol.util.isboolean.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0045](https://nodejs.org/api/deprecations.html) |
| [Util.isBuffer has been removed](../rules/nodejs.symbol.util.isbuffer.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0046](https://nodejs.org/api/deprecations.html) |
| [Util.isDate has been removed](../rules/nodejs.symbol.util.isdate.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0047](https://nodejs.org/api/deprecations.html) |
| [Util.isError has been removed](../rules/nodejs.symbol.util.iserror.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0048](https://nodejs.org/api/deprecations.html) |
| [Util.isFunction has been removed](../rules/nodejs.symbol.util.isfunction.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0049](https://nodejs.org/api/deprecations.html) |
| [Util.isNull has been removed](../rules/nodejs.symbol.util.isnull.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0050](https://nodejs.org/api/deprecations.html) |
| [Util.isNullOrUndefined has been removed](../rules/nodejs.symbol.util.isnullorundefined.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0051](https://nodejs.org/api/deprecations.html) |
| [Util.isNumber has been removed](../rules/nodejs.symbol.util.isnumber.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0052](https://nodejs.org/api/deprecations.html) |
| [Util.isObject has been removed](../rules/nodejs.symbol.util.isobject.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0053](https://nodejs.org/api/deprecations.html) |
| [Util.isPrimitive has been removed](../rules/nodejs.symbol.util.isprimitive.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0054](https://nodejs.org/api/deprecations.html) |
| [Util.isRegExp has been removed](../rules/nodejs.symbol.util.isregexp.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0055](https://nodejs.org/api/deprecations.html) |
| [util.isString has been removed](../rules/nodejs.symbol.util.isstring.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0045 to DEP0058 util.is* functions](https://nodejs.org/api/deprecations.html) |
| [Util.isSymbol has been removed](../rules/nodejs.symbol.util.issymbol.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0057](https://nodejs.org/api/deprecations.html) |
| [Util.isUndefined has been removed](../rules/nodejs.symbol.util.isundefined.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0058](https://nodejs.org/api/deprecations.html) |
| [Util.log has been removed](../rules/nodejs.symbol.util.log.html) | Removed | The source gives no day | `vers:semver/>=23.0.0` | [Node.js deprecations: DEP0059](https://nodejs.org/api/deprecations.html) |
| [Util.print has been removed](../rules/nodejs.symbol.util.print.html) | Removed | The source gives no day | `vers:semver/>=12.0.0` | [Node.js deprecations: DEP0026](https://nodejs.org/api/deprecations.html) |
| [Util.puts has been removed](../rules/nodejs.symbol.util.puts.html) | Removed | The source gives no day | `vers:semver/>=12.0.0` | [Node.js deprecations: DEP0027](https://nodejs.org/api/deprecations.html) |
| [Vm.runInDebugContext has been removed](../rules/nodejs.symbol.vm.runindebugcontext.html) | Removed | The source gives no day | `vers:semver/>=10.0.0` | [Node.js deprecations: DEP0069](https://nodejs.org/api/deprecations.html) |
| [Node.js 22 reaches end-of-life on 2027-04-30](../rules/nodejs.runtime.eol-22.html) | Scheduled end of life | 2027-04-30 | `vers:semver/>=22.0.0\|<23.0.0` | [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json) |
| [The Buffer() constructor is deprecated](../rules/nodejs.symbol.buffer.constructor.html) | Deprecated | The source gives no day | `vers:semver/>=10.0.0` | [Node.js deprecations: DEP0005 Buffer() constructor](https://nodejs.org/api/deprecations.html) |
| [New crypto.Certificate() is deprecated](../rules/nodejs.symbol.crypto.certificate.html) | Deprecated | The source gives no day | `vers:semver/>=14.9.0` | [Node.js deprecations: DEP0146](https://nodejs.org/api/deprecations.html) |
| [Crypto.fips is deprecated](../rules/nodejs.symbol.crypto.fips.html) | Deprecated | The source gives no day | `vers:semver/>=10.0.0` | [Node.js deprecations: DEP0093](https://nodejs.org/api/deprecations.html) |
| [The crypto.Hash constructor is deprecated](../rules/nodejs.symbol.crypto.hash.html) | Deprecated | The source gives no day | `vers:semver/>=22.0.0` | [Node.js deprecations: DEP0179](https://nodejs.org/api/deprecations.html) |
| [The crypto.Hmac constructor is deprecated](../rules/nodejs.symbol.crypto.hmac.html) | Deprecated | The source gives no day | `vers:semver/>=22.0.0` | [Node.js deprecations: DEP0181](https://nodejs.org/api/deprecations.html) |
| [Crypto.prng, crypto.pseudoRandomBytes and crypto.rng are deprecated](../rules/nodejs.symbol.crypto.prng.html) | Deprecated | The source gives no day | `vers:semver/>=11.0.0` | [Node.js deprecations: DEP0115](https://nodejs.org/api/deprecations.html) |
| [fs.exists is deprecated](../rules/nodejs.symbol.fs.exists.html) | Deprecated | The source gives no day | `vers:semver/>=1.0.0` | [Node.js deprecations: DEP0034 fs.exists](https://nodejs.org/api/deprecations.html) |
| [Fs.lchmod and fs.lchmodSync are deprecated](../rules/nodejs.symbol.fs.lchmod.html) | Deprecated | The source gives no day | `vers:semver/>=0.4.7` | [Node.js deprecations: DEP0035](https://nodejs.org/api/deprecations.html) |
| [The fs.Stats constructor is deprecated](../rules/nodejs.symbol.fs.stats.html) | Deprecated | The source gives no day | `vers:semver/>=22.0.0` | [Node.js deprecations: DEP0180](https://nodejs.org/api/deprecations.html) |
| [Module.parent is deprecated](../rules/nodejs.symbol.module.parent.html) | Deprecated | The source gives no day | `vers:semver/>=14.6.0` | [Node.js deprecations: DEP0144](https://nodejs.org/api/deprecations.html) |
| [Module.register is deprecated](../rules/nodejs.symbol.module.register.html) | Deprecated | The source gives no day | `vers:semver/>=25.9.0` | [Node.js deprecations: DEP0205](https://nodejs.org/api/deprecations.html) |
| [Path._makeLong is deprecated](../rules/nodejs.symbol.path.makelong.html) | Deprecated | The source gives no day | `vers:semver/>=9.0.0` | [Node.js deprecations: DEP0080](https://nodejs.org/api/deprecations.html) |
| [process.binding is deprecated](../rules/nodejs.symbol.process.binding.html) | Deprecated | The source gives no day | `vers:semver/>=10.9.0` | [Node.js deprecations: DEP0111 process.binding](https://nodejs.org/api/deprecations.html) |
| [Process._getActiveRequests and process._getActiveHandles are deprecated](../rules/nodejs.symbol.process.getactive.html) | Deprecated | The source gives no day | `vers:semver/>=17.6.0` | [Node.js deprecations: DEP0161](https://nodejs.org/api/deprecations.html) |
| [Process.mainModule is deprecated](../rules/nodejs.symbol.process.mainmodule.html) | Deprecated | The source gives no day | `vers:semver/>=14.0.0` | [Node.js deprecations: DEP0138](https://nodejs.org/api/deprecations.html) |
| [Process._tickCallback is deprecated](../rules/nodejs.symbol.process.tickcallback.html) | Deprecated | The source gives no day | `vers:semver/>=12.12.0` | [Node.js deprecations: DEP0134](https://nodejs.org/api/deprecations.html) |
| [Repl._builtinLibs is deprecated](../rules/nodejs.symbol.repl.builtinlibs.html) | Deprecated | The source gives no day | `vers:semver/>=14.3.0` | [Node.js deprecations: DEP0142](https://nodejs.org/api/deprecations.html) |
| [Repl.builtinModules is deprecated](../rules/nodejs.symbol.repl.builtinmodules.html) | Deprecated | The source gives no day | `vers:semver/>=24.0.0` | [Node.js deprecations: DEP0191](https://nodejs.org/api/deprecations.html) |
| [Require.extensions is deprecated](../rules/nodejs.symbol.require.extensions.html) | Deprecated | The source gives no day | `vers:semver/>=0.10.6` | [Node.js deprecations: DEP0039](https://nodejs.org/api/deprecations.html) |
| [url.parse is deprecated](../rules/nodejs.symbol.url.parse.html) | Deprecated | The source gives no day | `vers:semver/>=18.13.0` | [Node.js deprecations: DEP0169 url.parse](https://nodejs.org/api/deprecations.html) |
| [util._extend is deprecated](../rules/nodejs.symbol.util.extend.html) | Deprecated | The source gives no day | `vers:semver/>=6.0.0` | [Node.js deprecations: DEP0060 util._extend](https://nodejs.org/api/deprecations.html) |
| [util.isArray is deprecated](../rules/nodejs.symbol.util.isarray.html) | Deprecated | The source gives no day | `vers:semver/>=4.0.0` | [Node.js deprecations: DEP0044 util.isArray](https://nodejs.org/api/deprecations.html) |
| [Util.toUSVString is deprecated](../rules/nodejs.symbol.util.tousvstring.html) | Deprecated | The source gives no day | `vers:semver/>=20.8.0` | [Node.js deprecations: DEP0175](https://nodejs.org/api/deprecations.html) |
| [Util.types.isNativeError is deprecated](../rules/nodejs.symbol.util.types.isnativeerror.html) | Deprecated | The source gives no day | `vers:semver/>=24.2.0` | [Node.js deprecations: DEP0197](https://nodejs.org/api/deprecations.html) |
| [The produceCachedData option of vm.Script is deprecated](../rules/nodejs.symbol.vm.script.producecacheddata.html) | Deprecated | The source gives no day | `vers:semver/>=10.6.0` | [Node.js deprecations: DEP0110](https://nodejs.org/api/deprecations.html) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/nodejs.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/nodejs.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Node.js end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Node.js releases are end of life. Node.js 25 is end-of-life as of 2026-06-01. This page lists 80 reviewed lifecycle rules for pkg:generic/nodejs, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Node.js?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/nodejs."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Node.js dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
