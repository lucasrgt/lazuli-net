# Skies Node.js — agent operating notes

The repository-level `AGENTS.md` still governs this directory. These notes specialize it for the Node.js SDK.

## Laws

1. Generated application code is plain, idiomatic TypeScript that remains understandable without knowing Skies.
2. The ESLint doctor is removable: deleting it removes enforcement only; the application still compiles and runs.
3. Route registration is explicit. Do not add reflection, decorator discovery, a DI container, or generated behavior.
4. A slice handler is HTTP-agnostic and returns `Result<T>`. Only `map` and `@skiesjs/express` touch Express.

## Canonical slice

A `*.slice.ts` file exports, in order, `Input`, `Output`, `handle`, and `map`. Its test is beside it as
`*.slice.test.ts`. Modules import slices explicitly and call their `map` functions.

## Verification

```bash
cd node-sdk
npm ci
npm run check
```

Keep package source files under 500 lines and give exported APIs useful TSDoc. Never suppress a `SKYN*` rule to
make the workspace green.
