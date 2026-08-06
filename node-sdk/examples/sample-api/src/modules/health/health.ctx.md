# Health

Provides the process liveness boundary used by deployment probes.

## Boundaries

The module owns the health route and its HTTP-independent `handle` behavior. It owns no application data.

## Design notes

`map` registers the route explicitly so removing Skies enforcement cannot change runtime composition.
