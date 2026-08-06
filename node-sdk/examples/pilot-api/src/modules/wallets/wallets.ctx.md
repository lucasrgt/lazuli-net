# Wallets context

## Boundaries

The module owns access-token demonstration, wallet listing, wallet identifiers, and its PostgreSQL table. Local file
transport remains an application adapter and is deliberately outside the bounded context. Wallet pagination receives
one narrow `ListWallets` callback; there is no generic persistence or unit-of-work layer.

## Design notes

`walletIdCodec` is the single branded scalar conversion and `walletIdSchema` exposes the same UUID wire shape to Zod
and OpenAPI. `map` registers error codes and invokes every slice explicitly. The production `openWalletDatabase`
callback closes over the Drizzle query and applies deterministic creation-time and unique-ID ordering before paging.
