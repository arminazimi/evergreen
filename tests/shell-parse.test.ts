import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, parsePowerShell } from "../src/detectors/shell/parse-powershell.js";

const declaration = (value: string, line: number) => ({ kind: "powershell-version", value, line });

test("PowerShell fixtures preserve literal versions and exact lines", async () => {
  for (const [file, version, line] of [
    ["positive/scripts/build.ps1", "5.1", 1],
    ["positive/modules/Deploy.psm1", "7.0", 1],
    ["positive/modules/Deploy.psd1", "7.0", 7],
    ["zero/scripts/build.ps1", "7.5", 1],
    ["zero/modules/Deploy.psm1", "7.5", 1],
    ["zero/modules/Deploy.psd1", "7.5", 7],
  ] as const) {
    assert.deepEqual(parsePowerShell(await readFile(`tests/fixtures/shell/${file}`, "utf8")), [declaration(version, line)], file);
  }
});

test("PowerShell negative and malformed fixtures yield no partial declarations", async () => {
  for (const file of ["negative/scripts/lookalikes.ps1", "negative/modules/lookalikes.psm1", "negative/modules/Deploy.psd1", "malformed/scripts/broken.ps1", "malformed/modules/Broken.psd1"]) {
    assert.deepEqual(parsePowerShell(await readFile(`tests/fixtures/shell/${file}`, "utf8")), [], file);
  }
});

test("directives are case insensitive and tolerate BOM, indentation, CRLF and EOF", () => {
  assert.deepEqual(parsePowerShell("\uFEFF  #rEqUiReS -vErSiOn 7.2.1.0\r\n#Requires -Modules Pester\r\n#requires -version 5.1"), [declaration("7.2.1.0", 1), declaration("5.1", 3)]);
});

test("comments, strings and here-strings cannot manufacture directives", () => {
  const input = ["<#", "<# nested #>", "#Requires -Version 1.0", "#>", "$a = '", "#Requires -Version 2.0", "'", "$b = @\"", "#Requires -Version 3.0", "\"@", "$c = @'", "#Requires -Version 4.0", "'@", "#Requires -Version 7.4"].join("\n");
  assert.deepEqual(parsePowerShell(input), [declaration("7.4", 14)]);
});

test("manifest keys are case insensitive, quoted or bare, and report the value line", () => {
  assert.deepEqual(parsePowerShell("@{\n'PowerShellVersion' =\n'7.4'; ModuleVersion = '1.0'\n}"), [declaration("7.4", 3)]);
  assert.deepEqual(parsePowerShell('@{ powershellversion = "7.3" }'), [declaration("7.3", 1)]);
});

test("dynamic, nested and unrelated manifest values are ignored", () => {
  for (const input of [
    "@{ PowerShellVersion = $env:VERSION }", "@{ PowerShellVersion = '7.4' + '.1' }",
    "@{ PowerShellVersion = [version]'7.4' }", '@{ PowerShellVersion = "$version" }',
    "@{ PrivateData = @{ PowerShellVersion = '7.4' } }", "$x = @{ PowerShellVersion = '7.4' }",
    "@{ ModuleVersion = '7.4' }", "PowerShellVersion = '7.4'", "@{ PowerShellVersion = '7.*' }",
    "@{ PowerShellVersion = '7.4'\n} + @{ PowerShellVersion = '5.1' }",
  ]) assert.deepEqual(parsePowerShell(input), [], input);
});

test("unsupported directives do not guess versions", () => {
  for (const input of ["#Requires -Version $version", "#Requires -Version 7.x", "#Requires -Version 7.4 -Modules Pester", "# #Requires -Version 7.4", "Write-Host x #Requires -Version 7.4"]) assert.deepEqual(parsePowerShell(input), [], input);
});

test("unterminated lexical constructs and unmatched delimiters discard earlier declarations", () => {
  for (const suffix of ["'unterminated", '"unterminated', "<# unclosed", "([)]", "@{", "@'\nunclosed", '@"\nunclosed']) {
    assert.deepEqual(parsePowerShell(`#Requires -Version 5.1\n${suffix}`), [], suffix);
  }
});

test("PowerShell parsing is bounded and never throws on arbitrary text", () => {
  assert.deepEqual(parsePowerShell("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parsePowerShell(" ".repeat(MAXIMUM_LINE_LENGTH) + "#Requires -Version 5.1"), []);
  assert.deepEqual(parsePowerShell(""), []);
  assert.deepEqual(parsePowerShell("@{ Description = 'it''s a module'; PowerShellVersion = '7.4' }"), [declaration("7.4", 1)]);
  assert.deepEqual(parsePowerShell("Write-Host `\n#Requires -Version 5.1"), []);
  assert.deepEqual(parsePowerShell("#Requires -Version 7.0\ncmake -S . `\n  -D A=B `\n  -D C=D\n"), [declaration("7.0", 1)]);
  assert.deepEqual(parsePowerShell("@{ Description = 'x'\nPowerShellVersion = `\n'7.4' }"), [declaration("7.4", 3)]);
  assert.deepEqual(parsePowerShell('@{ PowerShellVersion = "7`n.4" }'), []);
  assert.deepEqual(parsePowerShell('@{ Description = "a""b"; PowerShellVersion = "7.4" }'), [declaration("7.4", 1)]);
  assert.deepEqual(parsePowerShell("@{\nPowerShellVersion =\n" + " ".repeat(MAXIMUM_LINE_LENGTH) + "'7.4'\n}"), []);
  assert.deepEqual(parsePowerShell("#Requires -Version 5.1\n<# trailing comment"), []);
});
