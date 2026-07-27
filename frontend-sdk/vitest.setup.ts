import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { server } from "avp-assay/react";
import { SAMPLE_API_BASE } from "../examples/sample-app/frontend/core/src/api";

const MISSING_WALLET = "99999999-9999-4999-8999-999999999999";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

beforeEach(() => {
  server.use(
    http.get(`${SAMPLE_API_BASE}/items`, () => HttpResponse.json({ items: [] })),
    http.post(`${SAMPLE_API_BASE}/deposit`, async ({ request }) => {
      await delay(50);
      const input = (await request.json()) as { walletId: string; amount: number };
      if (input.walletId === MISSING_WALLET) return new HttpResponse(null, { status: 404 });
      return HttpResponse.json({ walletId: input.walletId, balance: input.amount });
    }),
  );
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());
