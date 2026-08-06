# @skiesjs/testing

The closed Vitest vocabulary used by Skies Node.js gates: `unit`, `integration`, `e2e`, and `journey`.
The helpers attach ordinary reporter-visible Vitest metadata; removing this package only requires replacing
them with `test` calls—the application has no runtime dependency on testing.

```ts
import { journey, JourneyPath } from "@skiesjs/testing";

journey(
  { covers: "Wallets.Deposit", path: JourneyPath.Happy, criterion: "wallet.deposit" },
  "deposits and observes the balance",
  async () => { /* boot the real app and assert the observable effect */ },
);
```

`startTestHost` is deliberately composition-agnostic. It passes explicit test overrides to the application's own
factory before running its real startup seed, then exposes an idempotent close hook.
