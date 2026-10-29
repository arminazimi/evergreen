import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

interface Contributor {
  login: string;
  name: string;
  avatar_url: string;
  profile: string;
  contributions: string[];
}

interface Config {
  projectName: string;
  projectOwner: string;
  repoType: string;
  repoHost: string;
  files: string[];
  imageSize: number;
  contributorsPerLine: number;
  linkToUsage: boolean;
  badgeTemplate: string;
  contributors: Contributor[];
}

/** The contribution types the all-contributors specification defines. */
const TYPES = new Set([
  "audio", "a11y", "bug", "blog", "business", "code", "content", "data", "doc", "design", "example",
  "eventOrganizing", "financial", "fundingFinding", "ideas", "infra", "maintenance", "mentoring",
  "platform", "plugin", "projectManagement", "promotion", "question", "research", "review", "security",
  "talk", "test", "tool", "translation", "tutorial", "video",
]);

const config = JSON.parse(await readFile(resolve(".all-contributorsrc"), "utf8")) as Config;
const readme = await readFile(resolve("README.md"), "utf8");

test("the all-contributors config names this repository and its README", () => {
  assert.equal(config.projectOwner, "arminazimi");
  assert.equal(config.projectName, "evergreen");
  assert.equal(config.repoType, "github");
  assert.equal(config.repoHost, "https://github.com");
  assert.deepEqual(config.files, ["README.md"]);
  assert.equal(config.imageSize, 100);
  assert.ok(config.contributorsPerLine > 0);
  assert.equal(config.linkToUsage, true);
  assert.ok(config.badgeTemplate.includes("<%= contributors.length %>"));
});

test("every contributor is unique, complete, and uses a defined contribution type", () => {
  assert.ok(config.contributors.length > 0);
  assert.equal(new Set(config.contributors.map((entry) => entry.login)).size, config.contributors.length);
  for (const contributor of config.contributors) {
    assert.match(contributor.login, /^[A-Za-z0-9-]+$/);
    assert.ok(contributor.name.trim().length > 0, contributor.login);
    assert.equal(contributor.profile, `https://github.com/${contributor.login}`);
    assert.match(contributor.avatar_url, /^https:\/\/avatars\.githubusercontent\.com\/u\/\d+\?v=\d+$/);
    assert.ok(contributor.contributions.length > 0, contributor.login);
    assert.equal(new Set(contributor.contributions).size, contributor.contributions.length);
    for (const type of contributor.contributions) assert.ok(TYPES.has(type), `${contributor.login}: ${type}`);
  }
});

test("the README badge counts the configured contributors and links to their section", () => {
  const badge = readme.match(/<!-- ALL-CONTRIBUTORS-BADGE:START[^>]*-->\n([\s\S]*?)<!-- ALL-CONTRIBUTORS-BADGE:END -->/);
  assert.ok(badge);
  assert.ok(badge[1]!.includes(`all_contributors-${config.contributors.length}-orange`), badge[1]);
  assert.ok(badge[1]!.includes("](#contributors-)"), badge[1]);
  assert.match(readme, /^## Contributors$/m);
});

test("the generated list is complete and its markers are not duplicated", () => {
  assert.equal(readme.split("<!-- ALL-CONTRIBUTORS-LIST:START").length - 1, 1);
  assert.equal(readme.split("<!-- ALL-CONTRIBUTORS-LIST:END").length - 1, 1);
  const list = readme.match(/<!-- ALL-CONTRIBUTORS-LIST:START[^>]*-->([\s\S]*?)<!-- ALL-CONTRIBUTORS-LIST:END -->/)?.[1];
  assert.ok(list);
  for (const contributor of config.contributors) {
    assert.ok(list.includes(`<a href="${contributor.profile}">`), `${contributor.login} links to their profile`);
    assert.ok(list.includes(`alt="${contributor.name}"`), `${contributor.login} shows their name`);
    assert.ok(list.includes(`${contributor.avatar_url}&size=100`), `${contributor.login} shows their avatar`);
  }
  assert.ok(readme.includes("https://github.com/all-contributors/all-contributors"), "the specification is linked");
});
