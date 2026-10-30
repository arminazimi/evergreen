# Inventory

`evergreen inventory` reads the JSON or text exports that cloud and cluster tools already produce and reports what they say is deployed: end-of-life runtimes, images, engines, cluster versions, and operating systems. Each result carries the importer, the file, and the exact place in the file the claim rests on, as an RFC 6901 JSON Pointer.

Evergreen never calls a cloud or cluster API. You run the export command on a machine with credentials, then give the file to `evergreen inventory`:

```bash
kubectl get deploy,sts,ds,cronjob,job,pod -A -o json > workloads.json
evergreen inventory workloads.json
```

Every importer reads one export file and produces items. The output is deterministic: results sort by file and pointer. An affected item means a lifecycle rule applies to the version the export names; `no-data` means Evergreen has no rule for that PURL, never that the thing is safe. A file no importer recognizes is listed, the run exits `2`, and the files that were recognized are still reported.

## Privacy

`inventory` reads only the files named on the command line. It makes no network request, runs no command, and reads no other file. It never executes code or tools from the scanned export. Output names only the resource's own short name: `resource` is never an account id, ARN, subscription id, project number, IP address, node name, tag, or environment variable. `--redact` replaces each resource name with the first 12 hex characters of its SHA-256, in text and JSON output alike.
