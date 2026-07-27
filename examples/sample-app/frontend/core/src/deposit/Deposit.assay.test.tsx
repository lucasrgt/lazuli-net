import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { actionEffect } from "avp-assay";
import type { ActionEffectSubject } from "avp-assay/react";
import { defineVerification } from "avp-assay/react/vitest";
import { SAMPLE_API_BASE } from "../api";
import { DepositView } from "./Deposit.view";

const VALID_WALLET = "11111111-1111-4111-8111-111111111111";

function renderDeposit() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <DepositView />
    </QueryClientProvider>
  );
}

/** @avp no-phantom-success */
const depositSubject: ActionEffectSubject = {
  name: "Deposit",
  render: renderDeposit,
  endpoint: { method: "POST", path: `${SAMPLE_API_BASE}/deposit` },
  action: { role: "button", name: /deposit/i },
  inputs: [
    { role: "textbox", name: /wallet/i, value: VALID_WALLET },
    { role: "textbox", name: /amount/i, value: "50" },
  ],
  successResponse: { walletId: VALID_WALLET, balance: 50 },
  successMarker: { text: /deposit complete/i },
  accepts: (body) => {
    const input = body as { walletId?: unknown; amount?: unknown };
    return typeof input.walletId === "string" && typeof input.amount === "number" && input.amount > 0;
  },
  singleFlight: true,
};

defineVerification(actionEffect, depositSubject, {
  // The product owns the semantic contract and keeps CI deterministic: the error must identify the failed
  // operation and tell the person what to do next. Assay supplies the model-oracle slot, never the answer.
  judge: (request) => {
    const text = (request.evidence as { text: string }).text.toLowerCase();
    const pass = text.includes("couldn't complete the deposit") && text.includes("try again");
    return {
      pass,
      reason: pass
        ? "names the failed deposit and a retry step"
        : "error lacks the deposit/retry contract",
    };
  },
});
