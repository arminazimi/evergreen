import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPurl, normalizePurl, parsePurl, PurlError, purlIdentity } from "../src/purl.js";

test("round-trips canonical PURLs for every supported type", async (t) => {
  for (const purl of [
    "pkg:npm/request@2.88.2",
    "pkg:npm/%40angular/core@17.0.0",
    "pkg:pypi/django-nose@1.4.7",
    "pkg:golang/github.com/gorilla/mux@v1.8.1",
    "pkg:cargo/serde@1.0.197",
    "pkg:maven/org.springframework.boot/spring-boot@3.2.0",
    "pkg:nuget/Newtonsoft.Json@13.0.3",
    "pkg:gem/rails@7.1.3",
    "pkg:composer/laravel/framework@10.0.0",
    "pkg:pub/flutter_bloc@8.1.3",
    "pkg:swift/github.com/Alamofire/Alamofire@5.8.1",
    "pkg:docker/library/node@20?repository_url=docker.io",
    "pkg:github/actions/checkout@v4",
    "pkg:generic/nodejs@20.11.0",
  ]) {
    await t.test(purl, () => {
      assert.equal(normalizePurl(purl), purl);
      assert.equal(formatPurl(parsePurl(purl)), purl);
    });
  }
});

test("parses every component", () => {
  assert.deepEqual(parsePurl("pkg:maven/org.apache/commons-lang3@3.14.0?classifier=sources&type=jar#src/main"), {
    type: "maven",
    namespace: "org.apache",
    name: "commons-lang3",
    version: "3.14.0",
    qualifiers: { classifier: "sources", type: "jar" },
    subpath: "src/main",
  });
});

test("applies type-specific normalization", () => {
  assert.equal(normalizePurl("pkg:PyPI/Django_Nose"), "pkg:pypi/django-nose");
  assert.equal(normalizePurl("pkg:npm/%40Angular/Core"), "pkg:npm/%40angular/core");
  assert.equal(normalizePurl("pkg:github/Actions/Checkout"), "pkg:github/actions/checkout");
  assert.equal(normalizePurl("pkg:composer/Laravel/Framework"), "pkg:composer/laravel/framework");
  assert.equal(normalizePurl("pkg:maven/Org.Apache/Commons"), "pkg:maven/Org.Apache/Commons");
  assert.equal(normalizePurl("pkg:nuget/Newtonsoft.Json"), "pkg:nuget/Newtonsoft.Json");
});

test("sorts qualifiers and drops empty values", () => {
  assert.equal(normalizePurl("pkg:docker/node?tag=&arch=amd64&os=linux"), "pkg:docker/node?arch=amd64&os=linux");
});

test("returns the version-less identity used by registry rules", () => {
  assert.equal(purlIdentity("pkg:npm/%40angular/core@17.0.0?foo=bar#x"), "pkg:npm/%40angular/core");
  assert.equal(purlIdentity({ type: "pypi", name: "Django_Nose" }), "pkg:pypi/django-nose");
});

test("rejects malformed PURLs", async (t) => {
  for (const value of ["npm/request", "pkg:", "pkg:npm", "pkg:npm/", "pkg:1npm/request", "pkg:npm/%E0%A4%A"]) {
    await t.test(value, () => assert.throws(() => parsePurl(value), PurlError));
  }
});
