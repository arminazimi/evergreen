import { test } from "node:test";

import {
  checkDocumentRoundTrip,
  checkRoundTrip,
  checkToleratesArbitraryText,
  type DocumentRoundTripCase,
  type RoundTripCase,
  TEST_TIMEOUT_MS,
} from "./harness.js";

/**
 * Property tests for the parsers that read a document rather than text: the inventory importers, the
 * two SBOM enrichers and scanners, and the configuration validator.
 *
 * A document parser's round trip is what the deployed thing looks like on the way back. Importers
 * report a name, a PURL, and a version, so the canonical export must hand those values over intact.
 * `tests/fuzz/parsers.test.ts` proves the same parsers survive hostile documents; this suite proves
 * they read a real one.
 */

const CASES: readonly DocumentRoundTripCase[] = [
  // Inventory: one `az`/`aws`/`gcloud`/`kubectl`/`docker` export each.
  {
    name: "inventory:k8s-workloads",
    document: ({ name, version }) => ({
      kind: "List",
      items: [
        {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: { name },
          spec: { template: { spec: { containers: [{ image: `${name}:${version}` }] } } },
        },
      ],
    }),
    names: "zzmark|checkout",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [`cluster/Deployment/${name}`, `pkg:docker/library/${name}`, version],
  },
  {
    name: "inventory:k8s-cluster",
    document: ({ name, version }) => ({
      kind: "List",
      items: [{ kind: "Node", metadata: { name }, status: { nodeInfo: { kubeletVersion: `v${version}` } } }],
    }),
    names: "zzmark-node",
    versions: "9.8.7|1.21.0",
  },
  {
    name: "inventory:os-release",
    document: ({ name, version }) => `ID=${name}\nVERSION_ID="${version}"\n`,
    names: "zzmark|debian",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [`pkg:generic/${name}`, version],
  },
  {
    name: "inventory:docker",
    document: ({ name, version }) => [{ Service: name, Image: `${name}:${version}` }],
    names: "zzmark|checkout",
    versions: "9.8.7|1.21.0",
  },
  {
    name: "inventory:aws-rds",
    document: ({ name, version }) => ({
      DBInstances: [{ DBInstanceIdentifier: name, Engine: "postgres", EngineVersion: version }],
    }),
    names: "zzmark",
    versions: "9.8.7|14.2",
  },
  {
    name: "inventory:aws-eks",
    document: ({ name, version }) => ({ cluster: { name, version, platformVersion: "eks.21" } }),
    names: "zzmark",
    versions: "9.8.7|1.21.0",
  },
  {
    name: "inventory:aws-lambda",
    document: ({ name, version }) => ({ Functions: [{ FunctionName: name, Runtime: version }] }),
    names: "zzmark",
    versions: "nodejs14.x|nodejs20.x",
  },
  {
    name: "inventory:gcp",
    document: ({ name, version }) => [{ name, currentMasterVersion: version }],
    names: "zzmark",
    versions: "9.8.7|1.21.0",
  },
  {
    name: "inventory:azure",
    document: ({ name, version }) => [
      { name, kubernetesVersion: version, agentPoolProfiles: [{ orchestratorVersion: version }] },
    ],
    names: "zzmark",
    versions: "9.8.7|1.21.0",
    markers: ({ version }) => ["pkg:generic/azure-aks", version],
  },
  {
    name: "inventory:terraform-state",
    document: ({ name, version }) => ({
      format_version: "1.0",
      values: {
        root_module: {
          resources: [
            { type: "aws_eks_cluster", name, mode: "managed", address: `aws_eks_cluster.${name}`, values: { version } },
          ],
        },
      },
    }),
    names: "zzmark",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [`aws_eks_cluster.${name}`, version],
  },

  // SBOM round trips: the enrichers echo the document, the scanners report what they matched.
  {
    name: "enrichCycloneDx",
    document: ({ name, version }) => ({
      bomFormat: "CycloneDX",
      specVersion: "1.4",
      components: [{ purl: `pkg:generic/${name}@${version}`, version }],
    }),
    names: "zzmark",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [`pkg:generic/${name}@${version}`, version],
  },
  {
    name: "enrichSpdx",
    document: ({ name, version }) => ({
      spdxVersion: "SPDX-2.3",
      packages: [
        {
          SPDXID: "SPDXRef-Package",
          name,
          versionInfo: version,
          externalRefs: [{ referenceType: "purl", referenceLocator: `pkg:generic/${name}@${version}` }],
        },
      ],
    }),
    names: "zzmark",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [`pkg:generic/${name}@${version}`, name, version],
  },
  {
    name: "validateConfig",
    document: ({ name, version }) => ({ ignore: [name], dataVersion: version }),
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "scanCycloneDx",
    document: ({ name, version }) => ({
      bomFormat: "CycloneDX",
      specVersion: "1.4",
      components: [{ purl: `pkg:generic/${name}@${version}`, version }],
    }),
    names: "zzmark",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [`pkg:generic/${name}`, version],
  },
  {
    name: "scanSpdx",
    document: ({ name, version }) => ({
      spdxVersion: "SPDX-2.3",
      packages: [
        {
          SPDXID: "SPDXRef-Package",
          name,
          versionInfo: version,
          externalRefs: [{ referenceType: "purl", referenceLocator: `pkg:generic/${name}@${version}` }],
        },
      ],
    }),
    names: "zzmark",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [`pkg:generic/${name}`, version],
  },
];

for (const target of CASES) {
  test(`${target.name} round-trips a canonical document`, { timeout: TEST_TIMEOUT_MS }, async () => {
    await checkDocumentRoundTrip(target);
  });
}

/**
 * The two inventory helpers that read a document as text: `parseExport` decides whether an export is
 * JSON or a plain file such as `/etc/os-release`, and `parseOsReleaseDocument` splits the latter into
 * one block per host. They are string parsers, so they join this suite as round-trip cases.
 */ const TEXT_CASES: readonly RoundTripCase[] = [
  {
    name: "parseExport (inventory)",
    file: ({ name, version }) => `{"ID":"${name}","VERSION_ID":"${version}"}\n`,
    names: "zzmark|checkout",
    versions: "9.8.7|1.21.0",
  },
  {
    name: "parseOsReleaseDocument (inventory)",
    file: ({ name, version }) => `### host: ${name}\nID=zzmark\nVERSION_ID="${version}"\n`,
    names: "builder|checkout-node",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [name, version, "zzmark", "ID", "VERSION_ID"],
  },
];

for (const target of TEXT_CASES) {
  test(`${target.name} round-trips a canonical export`, () => {
    checkRoundTrip(target);
  });
}

test("every inventory document parser tolerates arbitrary text", () => {
  for (const target of TEXT_CASES) checkToleratesArbitraryText(target.name);
});
