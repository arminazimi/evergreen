# Shell and PowerShell fixtures

These fixtures are the data that the Shell and PowerShell tasks in [epic #47](https://github.com/arminazimi/evergreen/issues/47) test against. The scope is the `#Requires -Version` directive in `*.ps1` and `*.psm1` files, the `PowerShellVersion` key in `*.psd1` manifests, and the `shell:` declarations and pinned container `image:` values in `.github/workflows/*.yml` files. Each folder is a small repository root. Line numbers below are 1-based.

The version values are parser examples only: **they do not claim that any PowerShell or Bash version is end of life or deprecated.** A lifecycle finding needs a reviewed rule with an authoritative source. The bundled rules in `registry/shell.json` cover PowerShell 6.x and 7.0 through 7.3, so only the 7.0 declarations in the positive folder produce findings today (`tests/shell.test.ts`). The 5.1 requirement (Windows PowerShell follows the Windows lifecycle) and the 7.4 image (supported until 2026-11-10) have no rule and produce none.

| Fixture file | Expected case |
| --- | --- |
| `positive/scripts/build.ps1` | `#Requires -Version 5.1` at line 1 is a PowerShell version declaration. The `param` block and its `Configuration` default (line 5) are not declarations. Windows PowerShell 5.1 has no rule, so it produces no finding. |
| `positive/modules/Deploy.psm1` | `#Requires -Version 7.0` at line 1 is a PowerShell version declaration. **Must produce at least one finding** once a reviewed rule covers this declaration. |
| `positive/modules/Deploy.psd1` | `PowerShellVersion = '7.0'` at line 7 is the manifest declaration. `ModuleVersion` (line 3) is the module's own version, not a PowerShell requirement, and produces no declaration. **Must produce at least one finding** once a reviewed rule covers this declaration. |
| `positive/.github/workflows/ci.yml` | Step-level `shell: pwsh` at lines 9 and 18 and `shell: bash` at line 27 are shell declarations. Pinned container images `mcr.microsoft.com/powershell:7.4-ubuntu-22.04` (line 14) and `bash:5.2` (line 23) are pinned PowerShell and Bash images. PowerShell 7.4 is supported until 2026-11-10 and Bash has no rule, so these produce no finding yet. |
| `negative/scripts/lookalikes.ps1` | `#Requires -Modules Pester` (line 1) is a module requirement, not a version. The version-looking text in a line comment (line 2), a block comment (line 5), and a string literal (line 7) is not a directive. The runtime check `[version]'7.0'` (line 8) and the environment-variable value on line 9 are not literal declarations. **Must produce zero findings.** |
| `negative/modules/lookalikes.psm1` | The commented-out `PowerShellVersion` key (line 1) and the version text in a string (line 5) are not declarations. **Must produce zero findings.** |
| `negative/modules/Deploy.psd1` | The commented-out `PowerShellVersion` key (line 5) is not a declaration. The unrelated keys `ModuleVersion` (line 3) and `CompatiblePSEditions` (line 6) are ignored, and `ReleaseNotes` (line 9) mentions the key only in prose. **Must produce zero findings.** |
| `negative/.github/workflows/ci.yml` | `shell: [pwsh, bash]` (line 8) is a matrix value list under `matrix`, not a step declaration. `SHELL_NAME` (line 10) is an unrelated environment key. The `# shell: pwsh` comment (line 17) is ignored. The dynamic values `shell: ${{ matrix.shell }}` (line 14) and `image: ${{ inputs.powershell-image }}` (line 22) are not literal. **Must produce zero findings.** |
| `zero/scripts/build.ps1` | `#Requires -Version 7.5` (line 1) is a valid literal declaration. **Must produce zero findings.** |
| `zero/modules/Deploy.psm1` | `#Requires -Version 7.5` (line 1) is a valid literal declaration. **Must produce zero findings.** |
| `zero/modules/Deploy.psd1` | `PowerShellVersion = '7.5'` (line 7) is a valid literal declaration. **Must produce zero findings.** |
| `zero/.github/workflows/ci.yml` | Pinned image `mcr.microsoft.com/powershell:7.5-ubuntu-24.04` (line 7) and `shell: pwsh` (line 11) are valid. **Must produce zero findings.** |
| `malformed/scripts/broken.ps1` | Unterminated single-quoted string `'Release` on line 3 and an unclosed `param(` block. **No declarations and no error**, including the otherwise valid `#Requires -Version 5.1` on line 1. |
| `malformed/modules/Broken.psd1` | Unclosed `@(` on line 4, with no closing `)`. **No declarations and no error**, including the otherwise valid `PowerShellVersion = '5.1'` on line 3. |
| `malformed/.github/workflows/ci.yml` | Unclosed flow sequence opened by `steps: [` on line 8 makes the YAML invalid. **No declarations and no error**, including the otherwise valid `image:` on line 7. |

The `zero` fixtures are valid projects with literal, current declarations, so they yield no findings. The `negative` fixtures contain only comments, unrelated keys, and dynamic values, so they yield no findings. The `malformed` fixtures must not throw and must not return partial declarations.
