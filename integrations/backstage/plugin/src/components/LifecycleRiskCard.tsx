import { useEntity } from "@backstage/plugin-catalog-react";
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
  StructuredMetadataTable,
} from "@backstage/core-components";
import { useApi } from "@backstage/core-plugin-api";
import { Link, Typography } from "@material-ui/core";
import React from "react";

import {
  SERVICE_PATH_ANNOTATION,
  SEVERITIES,
  highestSeverity,
  totalFindings,
  type PortalService,
} from "../../../common/portal";
import { evergreenApiRef } from "../api";

type LoadState =
  | { status: "loading" }
  | { status: "missing-annotation" }
  | { status: "error"; error: Error }
  | { status: "ready"; service: PortalService };

function useLifecycleRisk(): LoadState {
  const { entity } = useEntity();
  const api = useApi(evergreenApiRef);
  const servicePath = entity.metadata.annotations?.[SERVICE_PATH_ANNOTATION];
  const [state, setState] = React.useState<LoadState>(
    servicePath ? { status: "loading" } : { status: "missing-annotation" },
  );

  React.useEffect(() => {
    if (!servicePath) {
      setState({ status: "missing-annotation" });
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    api
      .getService(servicePath)
      .then((service) => {
        if (!cancelled) setState({ status: "ready", service });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, servicePath]);

  return state;
}

export function LifecycleRiskCard() {
  const state = useLifecycleRisk();

  if (state.status === "missing-annotation") {
    return (
      <InfoCard title="Evergreen lifecycle risk">
        <Typography variant="body2">
          Add the <code>{SERVICE_PATH_ANNOTATION}</code> annotation on this
          component, set to the scanned path from{" "}
          <code>evergreen export --format portal</code>.
        </Typography>
      </InfoCard>
    );
  }

  if (state.status === "loading") {
    return (
      <InfoCard title="Evergreen lifecycle risk">
        <Progress />
      </InfoCard>
    );
  }

  if (state.status === "error") {
    return (
      <InfoCard title="Evergreen lifecycle risk">
        <ResponseErrorPanel error={state.error} />
      </InfoCard>
    );
  }

  const { service } = state;
  const metadata: Record<string, React.ReactNode> = {
    Path: service.path,
    Findings: String(totalFindings(service)),
    Highest: highestSeverity(service),
    "Next end of life": service.nextEndOfLife ?? "—",
    Report: (
      <Link href={service.reportLink} target="_blank" rel="noopener noreferrer">
        Open Evergreen report
      </Link>
    ),
  };
  for (const severity of SEVERITIES) {
    metadata[severity] = String(service.severities[severity]);
  }

  return (
    <InfoCard title="Evergreen lifecycle risk" deepLink={{ title: "Report", link: service.reportLink }}>
      <StructuredMetadataTable metadata={metadata} />
    </InfoCard>
  );
}
