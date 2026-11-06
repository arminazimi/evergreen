// Which Evergreen product family each Package URL belongs to in the endoflife.date comparison.
//
// Only release-cycle products are mapped. An npm package deprecation, a Kubernetes API retirement, or an
// App Store submission policy is a different kind of claim, and endoflife.date publishes no product cycle
// for it; those families are listed under NOT_COMPARABLE_REASONS with the reason, never silently dropped.

export interface ProductReference {
  /** The endoflife.date product slug. */
  product: string;
  /** A fixed release cycle, used by AWS Lambda where the product name carries the runtime identifier. */
  cycle?: string;
}

/** The purl prefix of AWS Lambda managed runtimes; the suffix is the endoflife.date cycle. */
export const LAMBDA_PURL_PREFIX = "pkg:generic/aws-lambda-runtime/";

/** Evergreen purl to endoflife.date product. */
export const PRODUCT_BY_PURL: Readonly<Record<string, string>> = {
  "pkg:generic/nodejs": "nodejs",
  "pkg:generic/python": "python",
  "pkg:generic/golang": "go",
  "pkg:generic/ruby": "ruby",
  "pkg:generic/php": "php",
  "pkg:generic/rust": "rust",
  "pkg:generic/dotnet": "dotnet",
  "pkg:generic/deno": "deno",
  "pkg:generic/bun": "bun",
  "pkg:generic/elixir": "elixir",
  "pkg:generic/erlang": "erlang",
  "pkg:generic/scala": "scala",
  "pkg:generic/terraform": "terraform",
  "pkg:generic/powershell": "powershell",
  "pkg:generic/kubernetes": "kubernetes",
  "pkg:generic/amazon-eks": "amazon-eks",
  "pkg:generic/postgresql": "postgresql",
  "pkg:generic/mysql": "mysql",
  "pkg:generic/mariadb": "mariadb",
  "pkg:generic/redis": "redis",
  "pkg:generic/mongodb": "mongodb",
  "pkg:generic/nginx": "nginx",
  "pkg:generic/aws-rds/mysql": "amazon-rds-mysql",
  "pkg:generic/aws-rds/postgres": "amazon-rds-postgresql",
  "pkg:generic/aws-aurora/postgresql": "amazon-aurora-postgresql",
  "pkg:generic/aws-elasticache/redis": "amazon-elasticache-redis",
  "pkg:generic/azure-database-mysql": "azure-database-for-mysql",
  "pkg:generic/azure-database-postgresql": "azure-database-for-postgresql",
  "pkg:docker/library/node": "nodejs",
  "pkg:docker/library/python": "python",
  "pkg:docker/library/ruby": "ruby",
  "pkg:docker/library/golang": "go",
  "pkg:docker/library/php": "php",
  "pkg:docker/library/postgres": "postgresql",
  "pkg:docker/library/mysql": "mysql",
  "pkg:docker/library/mariadb": "mariadb",
  "pkg:docker/library/redis": "redis",
  "pkg:docker/library/ubuntu": "ubuntu",
  "pkg:docker/library/debian": "debian",
  "pkg:docker/library/alpine": "alpine-linux",
  "pkg:docker/library/caddy": "caddy",
  "pkg:docker/library/clickhouse": "clickhouse",
  "pkg:docker/library/couchbase": "couchbase-server",
  "pkg:docker/library/couchdb": "apache-couchdb",
  "pkg:docker/library/drupal": "drupal",
  "pkg:docker/library/phpmyadmin": "phpmyadmin",
  "pkg:docker/library/traefik": "traefik",
  "pkg:docker/library/zookeeper": "zookeeper",
  "pkg:generic/alpine": "alpine-linux",
  "pkg:generic/ubuntu": "ubuntu",
  "pkg:generic/debian": "debian",
  "pkg:generic/centos": "centos",
  "pkg:generic/rhel": "rhel",
  "pkg:generic/amzn": "amazon-linux",
  "pkg:generic/sles": "sles",
};

export interface NotComparableReason {
  /** Stable code used in the result JSON. */
  code: string;
  /** Why this family has no endoflife.date release cycle to compare. */
  description: string;
  /** Purl prefixes that belong to the family. The first matching prefix wins. */
  prefixes: readonly string[];
}

/** Ordered: the first prefix that matches a purl decides its reason. */
export const NOT_COMPARABLE_REASONS: readonly NotComparableReason[] = [
  {
    code: "api-retirement",
    description: "The rule retires a Kubernetes API version or a Helm repository, not a release cycle of a product.",
    prefixes: ["pkg:generic/kubernetes/", "pkg:generic/helm-repository/"],
  },
  {
    code: "github-actions",
    description: "endoflife.date publishes no GitHub Actions product; the rule is about an action's runtime.",
    prefixes: ["pkg:github/", "pkg:generic/github-actions/"],
  },
  {
    code: "store-policy",
    description: "The rule is a mobile store or billing policy with no endoflife.date release cycle.",
    prefixes: ["pkg:maven/com.android.billingclient/", "pkg:generic/android/"],
  },
  {
    code: "app-store-policy",
    description: "The rule is an App Store submission policy for Xcode or an iOS deployment target.",
    prefixes: ["pkg:generic/xcode", "pkg:generic/ios"],
  },
  {
    code: "toolchain-policy",
    description: "The rule is a CMake policy or generator deprecation, not a CMake release cycle.",
    prefixes: ["pkg:generic/cmake"],
  },
  {
    code: "ci-image-retirement",
    description: "The rule retires a hosted CI image, which endoflife.date does not publish as a product cycle.",
    prefixes: ["pkg:generic/azure-pipelines/"],
  },
  {
    code: "dockerfile-format",
    description: "The rule is a Dockerfile syntax deprecation, not a release cycle.",
    prefixes: ["pkg:generic/dockerfile"],
  },
  {
    code: "different-support-model",
    description:
      "Evergreen records the end of extended or LTS support for this managed service; endoflife.date publishes the standard-support boundary, so the dates describe different events.",
    prefixes: [
      "pkg:generic/azure-aks",
      "pkg:generic/azure-kubernetes-service",
      "pkg:generic/google-gke",
      "pkg:generic/google-kubernetes-engine",
    ],
  },
  {
    code: "different-cycle-model",
    description:
      "endoflife.date publishes Aurora engine versions where Evergreen records MySQL compatibility versions, so the two cannot be compared cycle by cycle.",
    prefixes: ["pkg:generic/aws-aurora/mysql"],
  },
  {
    code: "managed-runtime",
    description: "The rule is a managed platform's runtime policy with no matching endoflife.date product.",
    prefixes: [
      "pkg:generic/google-appengine-runtime/",
      "pkg:generic/google-cloud-functions-runtime/",
      "pkg:generic/azure-app-service/",
      "pkg:generic/azure-functions",
    ],
  },
  {
    code: "package-level",
    description:
      "The rule is a per-package deprecation or support claim. endoflife.date publishes some framework cycles, but not a per-package deprecation date, so this comparison scores release-cycle products only.",
    prefixes: [
      "pkg:npm/",
      "pkg:pypi/",
      "pkg:composer/",
      "pkg:cargo/",
      "pkg:nuget/",
      "pkg:golang/",
      "pkg:hex/",
      "pkg:pub/",
      "pkg:gem/",
      "pkg:maven/",
    ],
  },
  {
    code: "no-product",
    description: "endoflife.date publishes no product with a release cycle for this purl.",
    prefixes: [],
  },
];

/** The endoflife.date product and optional fixed cycle for a purl, or undefined when it is not comparable. */
export function productFor(purl: string): ProductReference | undefined {
  if (purl.startsWith(LAMBDA_PURL_PREFIX)) {
    return { product: "aws-lambda", cycle: purl.slice(LAMBDA_PURL_PREFIX.length) };
  }
  const product = PRODUCT_BY_PURL[purl];
  return product ? { product } : undefined;
}

/** Why a purl has no endoflife.date comparison. Returns `undefined` for a mapped purl. */
export function notComparableReason(purl: string): NotComparableReason | undefined {
  if (productFor(purl)) return undefined;
  for (const reason of NOT_COMPARABLE_REASONS) {
    if (reason.prefixes.some((prefix) => purl === prefix || purl.startsWith(prefix))) return reason;
  }
  return NOT_COMPARABLE_REASONS.at(-1);
}

/** Every endoflife.date product this comparison maps to. */
export function mappedProducts(): string[] {
  return [...new Set(Object.values(PRODUCT_BY_PURL))].sort();
}
