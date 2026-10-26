# Container root filesystem fixture

An unpacked root filesystem that ships an end-of-life operating system and runtimes. The
`container` detector reads `etc/os-release` and the well-known runtime paths below; the test
in `tests/container-rootfs.test.ts` also packs this tree into a tar archive and asserts the same
findings point inside the archive.

| Path | Evidence |
| --- | --- |
| `etc/os-release` | Debian 11 (line 3 is `VERSION_ID="11"`). |
| `usr/local/include/node/node_version.h` | Node.js 16.20.2 (line 1). |
| `usr/local/go/VERSION` | Go 1.20.14 (line 1). |
| `usr/lib/jvm/java-13-openjdk-amd64/release` | Java 13.0.14 (line 2). |
| `usr/local/lib/python3.9/` | Python 3.9 (line 1); 3.12 is present and supported. |
| `usr/local/lib/ruby/3.1.0/` | Ruby 3.1.0 (line 1). |
| `usr/bin/php8.1` | PHP 8.1 (line 1). |
| `usr/share/dotnet/shared/Microsoft.NETCore.App/6.0.21/` | .NET 6.0.21 (line 1). |

Files such as `placeholder` exist only so that Git keeps the empty directories.
