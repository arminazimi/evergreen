import {
  createApiFactory,
  createComponentExtension,
  createPlugin,
  discoveryApiRef,
  fetchApiRef,
  configApiRef,
} from "@backstage/core-plugin-api";

import { EvergreenClient, evergreenApiRef } from "./api";

export const evergreenPlugin = createPlugin({
  id: "evergreen",
  apis: [
    createApiFactory({
      api: evergreenApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new EvergreenClient({ discoveryApi, fetchApi }),
    }),
  ],
});

/**
 * Entity card that shows lifecycle-risk counts, the next end-of-life date, and a report link
 * for the component's `evergreen.io/service-path` annotation.
 */
export const EntityEvergreenLifecycleCard = evergreenPlugin.provide(
  createComponentExtension({
    name: "EntityEvergreenLifecycleCard",
    component: {
      lazy: () =>
        import("./components/LifecycleRiskCard").then((m) => m.LifecycleRiskCard),
    },
  }),
);
