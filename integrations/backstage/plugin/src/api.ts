import {
  createApiRef,
  type ConfigApi,
  type DiscoveryApi,
  type FetchApi,
} from "@backstage/core-plugin-api";

import type { PortalCatalog, PortalService } from "../../common/portal";

export const evergreenApiRef = createApiRef<EvergreenApi>({
  id: "plugin.evergreen.service",
});

export interface EvergreenApi {
  getCatalog(): Promise<PortalCatalog>;
  getService(servicePath: string): Promise<PortalService>;
}

export class EvergreenClient implements EvergreenApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi; configApi?: ConfigApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl("evergreen");
  }

  async getCatalog(): Promise<PortalCatalog> {
    const response = await this.fetchApi.fetch(`${await this.baseUrl()}/catalog`);
    if (!response.ok) {
      throw new Error(`Evergreen catalog request failed: HTTP ${response.status}`);
    }
    return (await response.json()) as PortalCatalog;
  }

  async getService(servicePath: string): Promise<PortalService> {
    const url = new URL(`${await this.baseUrl()}/services`);
    url.searchParams.set("path", servicePath);
    const response = await this.fetchApi.fetch(url.toString());
    if (response.status === 404) {
      throw new Error(`No Evergreen portal service matches ${servicePath}`);
    }
    if (!response.ok) {
      throw new Error(`Evergreen service request failed: HTTP ${response.status}`);
    }
    return (await response.json()) as PortalService;
  }
}
