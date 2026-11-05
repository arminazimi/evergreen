import assert from "node:assert/strict";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, readXml, walk } from "../src/detectors/dotnet/msbuild-xml.js";

test("readXml: names, lines, lower-cased attributes, and trimmed text", () => {
  const repeated = readXml('<Project>\n  <PropertyGroup Label="A" LABEL="duplicate"/>\n</Project>');
  assert.equal(repeated, undefined, "a repeated attribute name, ignoring case, is not well formed");

  const parsed = readXml(
    "<Project>\n  <PropertyGroup Label=\"A\" Kind='B'>\n    <TargetFramework> net6.0 </TargetFramework>\n  </PropertyGroup>\n</Project>",
  );
  assert.ok(parsed);
  assert.equal(parsed.name, "Project");
  assert.equal(parsed.line, 1);
  const group = parsed.children[0];
  assert.ok(group);
  assert.equal(group.name, "PropertyGroup");
  assert.equal(group.line, 2);
  assert.deepEqual(
    [...group.attributes.entries()],
    [
      ["label", { value: "A", line: 2 }],
      ["kind", { value: "B", line: 2 }],
    ],
  );
  const target = group.children[0];
  assert.ok(target);
  assert.equal(target.text, "net6.0");
  assert.equal(target.line, 3);
  assert.equal(target.parent, group);
  assert.equal(group.parent, parsed);
  assert.equal(parsed.parent, undefined);
});

test("readXml: attribute lines are counted across newlines before the value", () => {
  const multi = readXml('<a\n  x="1"\n  y="2"/>');
  assert.ok(multi);
  assert.deepEqual(multi.attributes.get("x"), { value: "1", line: 2 });
  assert.deepEqual(multi.attributes.get("y"), { value: "2", line: 3 });
  const split = readXml('<a\n  x="1"\n  y\n="2"/>');
  assert.ok(split);
  assert.deepEqual(split.attributes.get("y"), { value: "2", line: 4 });
});

test("readXml: a BOM, comments, processing instructions, and DOCTYPE are skipped", () => {
  const root = readXml(
    '﻿<?xml version="1.0"?>\n<!DOCTYPE Project>\n<!-- note\n with lines -->\n<Project>\n<?pi data?>\n<Item/>\n</Project>\n',
  );
  assert.ok(root);
  assert.equal(root.name, "Project");
  assert.equal(root.line, 5);
  assert.deepEqual(
    root.children.map((child) => [child.name, child.line]),
    [["Item", 7]],
  );
});

test("readXml: CDATA is text, and entities are decoded only when predefined", () => {
  const root = readXml(
    '<Project a="x &amp; &quot;y&quot; &apos;z&apos; &lt;&gt; &nbsp;">\n  <Text>  <![CDATA[ a < b ]]> &amp; &unknown; </Text>\n</Project>',
  );
  assert.ok(root);
  assert.equal(root.attributes.get("a")?.value, `x & "y" 'z' <> &nbsp;`);
  assert.equal(root.children[0]?.text, "a < b & &unknown;");
});

test("readXml: self-closing and single-quoted attributes, and walk visits document order", () => {
  const root = readXml("<Project><A x='1'/><B><C/></B><D/></Project>");
  assert.ok(root);
  assert.deepEqual(
    [...walk(root)].map((element) => element.name),
    ["Project", "A", "B", "C", "D"],
  );
  assert.equal(root.children[0]?.attributes.get("x")?.value, "1");
});

test("readXml: malformed input returns undefined", () => {
  const malformed = [
    "",
    "   ",
    "<a>",
    "<a></b>",
    "</a>",
    "<a><!-- never closed</a>",
    "<a><?pi never closed</a>",
    "<a><![CDATA[ never closed</a>",
    "<![CDATA[ outside ]]><a/>",
    "<a/><b/>",
    "<a/>text",
    "<a x=1/>",
    '<a x="1" x="2"/>',
    "<1a/>",
    "<a><b/></a><c>",
  ];
  for (const input of malformed) assert.equal(readXml(input), undefined, JSON.stringify(input));
});

test("readXml: element nesting deeper than the limit returns undefined", () => {
  const within = `${"<n>".repeat(64)}${"</n>".repeat(64)}`;
  assert.ok(readXml(within));
  const beyond = `${"<n>".repeat(65)}${"</n>".repeat(65)}`;
  assert.equal(readXml(beyond), undefined);
});

test("readXml: more than 20,000 elements returns undefined", () => {
  const exactly = `<r>${"<e/>".repeat(19_999)}</r>`;
  assert.ok(readXml(exactly));
  const over = `<r>${"<e/>".repeat(20_000)}</r>`;
  assert.equal(readXml(over), undefined);
});

test("readXml: input over the byte limit returns undefined", () => {
  const padding = "x".repeat(MAXIMUM_INPUT_BYTES);
  assert.equal(readXml(`<a>${padding}</a>`), undefined);
});
