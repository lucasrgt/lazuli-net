import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dataHonesty } from "avp-assay";
import type { DataHonestySubject } from "avp-assay/react";
import { defineVerification } from "avp-assay/react/vitest";
import { SAMPLE_API_BASE } from "../api";
import { ItemsView } from "./Items.view";

function renderItems() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ItemsView />
    </QueryClientProvider>
  );
}

/** @avp count-matches-source */
const itemsSubject: DataHonestySubject = {
  name: "Items",
  render: renderItems,
  endpoint: { method: "GET", path: `${SAMPLE_API_BASE}/items` },
  items: { role: "listitem" },
  emptyResponse: { items: [] },
  countResponse: {
    items: [
      { id: "item-1", name: "First" },
      { id: "item-2", name: "Second" },
    ],
  },
  expectedCount: 2,
  fabricationMarkers: [],
};

defineVerification(dataHonesty, itemsSubject);
