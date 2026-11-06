import assert from "node:assert/strict";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, readXml, walk } from "../src/detectors/dotnet/msbuild-xml.js";

test("xml: elements, text, and 1-based lines", () => {
  const root = readXml(
    "<Project>\n  <PropertyGroup>\n    <TargetFramework>net6.0</TargetFramework>\n  </PropertyGroup>\n</Project>",
  );
  assert.ok(root);
  assert.equal(root.name, "Project");
  assert.equal(root.line, 1);
  assert.equal(root.text, "");
  assert.equal(root.parent, undefined);

  const group = root.children[0];
  assert.ok(group);
  assert.equal(group.name, "PropertyGroup");
  assert.equal(group.line, 2);
  assert.equal(group.parent, root);

  const target = group.children[0];
  assert.ok(target);
  assert.equal(target.name, "TargetFramework");
  assert.equal(target.line, 3);
  assert.equal(target.text, "net6.0");
  assert.equal(target.parent, group);
  assert.deepEqual(group.children, [target]);
});

test("xml: attributes keep their line, lower-case name, and decoded value", () => {
  const root = readXml(
    "<Project>\n<ItemGroup>\n<PackageReference\n  Include=\"A&amp;B\"\n  Version='1.0.0'\n/>\n</ItemGroup>\n</Project>",
  );
  assert.ok(root);
  const group = root.children[0];
  assert.ok(group);
  const reference = group.children[0];
  assert.ok(reference);
  assert.equal(reference.name, "PackageReference");
  assert.deepEqual(reference.attributes.get("include"), { value: "A&B", line: 4 });
  assert.deepEqual(reference.attributes.get("version"), { value: "1.0.0", line: 5 });
  assert.equal(reference.attributes.size, 2);
});

test("xml: comments, processing instructions, DOCTYPE, and CDATA are not elements", () => {
  const root = readXml(
    '<?xml version="1.0"?>\n<!DOCTYPE Project>\n<Project>\n<!-- <Ignored /> -->\n<ItemGroup>\n<Description><![CDATA[a < b]]></Description>\n</ItemGroup>\n</Project>',
  );
  assert.ok(root);
  assert.deepEqual(
    [...walk(root)].map((element) => [element.name, element.line, element.text]),
    [
      ["Project", 3, ""],
      ["ItemGroup", 5, ""],
      ["Description", 6, "a < b"],
    ],
  );
});

test("xml: text chunks around child elements are trimmed and concatenated", () => {
  const root = readXml("<a>one <b/> two</a>");
  assert.ok(root);
  assert.equal(root.text, "one two");
  assert.equal(root.children.length, 1);
});

test("xml: predefined entities are decoded, other entities are left as written", () => {
  const root = readXml("<a>&lt;&gt;&amp;&quot;&apos;&#65;&unknown;</a>");
  assert.ok(root);
  assert.equal(root.text, `<>&"'&#65;&unknown;`);
});

test("xml: malformed input returns undefined", () => {
  for (const contents of [
    "",
    "   ",
    "text",
    "<Project>",
    "<Project></Other>",
    "<Project><a></Project>",
    "<a/><b/>",
    '<a x="1" x="2"/>',
    "<a x=1/>",
    "<a><!-- unclosed",
    "<a><![CDATA[unclosed</a>",
    "<1a/>",
  ]) {
    assert.equal(readXml(contents), undefined, contents);
  }
});

test("xml: a byte-order mark is skipped and oversized input is refused", () => {
  assert.equal(readXml("\ufeff<Project/>")?.name, "Project");
  assert.equal(readXml(`<Project>${" ".repeat(MAXIMUM_INPUT_BYTES + 1)}</Project>`), undefined);
});

test("xml: walk visits depth-first in document order", () => {
  const root = readXml("<a><b><c/></b><d/></a>");
  assert.ok(root);
  assert.deepEqual(
    [...walk(root)].map((element) => element.name),
    ["a", "b", "c", "d"],
  );
});
