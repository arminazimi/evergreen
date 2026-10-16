/**
 * endoflife.date products the `endoflife-date` importer checks. The importer uses endoflife.date only as
 * an index; a product becomes a draft only when it has an official Docker image and a release-policy
 * link to the vendor's own page. Products that fail either test are named in the importer's notes.
 *
 * Use the product name from https://endoflife.date/api/v1/products/. Keep the list sorted.
 */
export const ENDOFLIFE_CANDIDATES: readonly string[] = [
  "amazon-corretto",
  "amazon-linux",
  "apache-couchdb",
  "caddy",
  "clear-linux",
  "clickhouse",
  "consul",
  "couchbase-server",
  "drupal",
  "go",
  "mariadb",
  "matomo",
  "mysql",
  "nodejs",
  "oracle-linux",
  "phpmyadmin",
  "postgresql",
  "python",
  "redis",
  "ruby",
  "traefik",
  "vinyl-cache",
  "wordpress",
  "zookeeper",
];
