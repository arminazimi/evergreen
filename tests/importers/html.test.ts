import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeEntities, stripHtml } from "../../tools/importers/html.js";

const collapse = (html: string) => stripHtml(html).replace(/\s+/g, " ").trim();

test("stripHtml removes a script block whose closing tag has whitespace before the angle bracket", () => {
  // CodeQL's js/bad-tag-filter names exactly this case: `</script >` next to `</script>`.
  assert.equal(collapse("a<script>evil()</script >b"), "a b");
  assert.equal(collapse("a<SCRIPT type=\"text/javascript\">evil()</SCRIPT\n>b"), "a b");
  assert.equal(collapse("a<style>body{}</style\t>b"), "a b");
});

test("stripHtml does not end a tag at a > inside a quoted attribute", () => {
  assert.equal(collapse('<p title="a > b">text</p>'), "text");
  assert.equal(collapse("<p data-x='>'>text</p>"), "text");
});

test("stripHtml drops comments without looking for script tags inside them", () => {
  assert.equal(collapse("a<!-- <script>evil()</script> -->b"), "a b");
  assert.equal(collapse("a<!DOCTYPE html>b"), "a b");
});

test("stripHtml keeps a lone < as text and separates words at removed tags", () => {
  assert.equal(collapse("a < b"), "a < b");
  assert.equal(collapse("1 < 2 > 0"), "1 < 2 > 0");
  assert.equal(collapse("a <b"), "a <b");
  assert.equal(collapse("<b>Go</b>1.27"), "Go 1.27");
});

test("stripHtml leaves an unterminated raw-text block without looping", () => {
  assert.equal(collapse("a<script>never closed"), "a");
});

test("decodeEntities decodes in one pass so an escaped tag stays text", () => {
  assert.equal(decodeEntities("&amp;lt;b&amp;gt;"), "&lt;b&gt;");
  assert.equal(decodeEntities("&amp;amp;"), "&amp;");
  assert.equal(decodeEntities("&lt;script&gt;"), "<script>");
});

test("decodeEntities handles named, decimal, and hex references", () => {
  assert.equal(decodeEntities("A&nbsp;B"), "A B");
  assert.equal(decodeEntities("&quot;&#39;&apos;"), "\"''");  assert.equal(decodeEntities("&#65;&#x42;&#x63;"), "ABc");
  assert.equal(decodeEntities("&AMP;"), "&");
});

test("decodeEntities leaves unknown and invalid references as written", () => {
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
  assert.equal(decodeEntities("&#xD800;"), "&#xD800;");
  assert.equal(decodeEntities("&#x110000;"), "&#x110000;");
  assert.equal(decodeEntities("&#9999999;"), "&#9999999;");
  assert.equal(decodeEntities("a & b"), "a & b");
});
