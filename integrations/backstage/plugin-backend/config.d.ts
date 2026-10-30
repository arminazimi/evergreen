export interface Config {
  /**
   * Evergreen developer-portal integration.
   * The backend only reads a published `evergreen.portal.v1` export; it never scans.
   */
  evergreen?: {
    /**
     * HTTP(S) URL or absolute filesystem path of the portal export JSON
     * produced by `evergreen export --format portal`.
     */
    portalExportSource: string;
  };
}
