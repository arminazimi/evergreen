# Evergreen scan report

- **Repository:** /repository
- **Scanned:** 2026\-11\-01T00:00:00\.000Z
- **Findings:** 4
- Data: bundled 2026\.11\.01, evidence reviewed through 2026\-10\-31 \(1 day ago\), stale

## Findings

| Severity | Finding | Location | Summary | Replacement | Evidence |
| --- | --- | --- | --- | --- | --- |
| critical | Title c | Dockerfile | Summary c | — | — |
| high | request &lt;deprecated&gt; | package\.json:12 | Pipe &#124; char &amp; &#92; back\*slash\_ | Use fetch | [Vendor notice](https://example.com/notice?a=1&b=%282%29)<br>Local (javascript:alert\(1\))<br>Broken (not a url) |
| info | Title d | src/z\.ts:2 | Summary d | — | — |
| low | Title b | src/z\.ts:4 | Summary b | — | — |

## Notes

- first note
- second &lt;note&gt;