/**
 * NuGet package ids the `dotnet-2` importer checks for deprecation.
 *
 * NuGet has no list of deprecated packages: a publisher marks a package, per version, with a deprecation
 * (reasons, a message, and sometimes an alternate package). The importer reads each candidate's registration
 * and drafts a rule when every listed version is deprecated for the `Legacy` reason. A candidate that is not
 * deprecated produces no rule and is named in the importer's notes, so it can be removed. Keep the list sorted.
 */
export const NUGET_CANDIDATES: readonly string[] = [
  "Microsoft.Azure.DocumentDB",
  "Microsoft.Azure.ServiceBus",
  "Microsoft.Azure.Storage.Blob",
  "System.Data.SqlClient",
  "WindowsAzure.Storage",
];
