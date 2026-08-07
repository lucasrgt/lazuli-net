# @skiesjs/eslint-plugin-node

The removable Skies doctor for plain TypeScript backend slices. Rules inspect the current syntax tree and normalized
local filename only; the plugin performs no synchronous filesystem reads and does not join workspace facts.

```js
import tsParser from "@typescript-eslint/parser";
import skiesNode from "@skiesjs/eslint-plugin-node";

export default [
  {
    ...skiesNode.configs["flat/recommended"],
    files: ["**/*.ts"],
    languageOptions: { parser: tsParser },
  },
];
```

## Public diagnostics

| Public ID / rule | Recommended | Diagnostic contract |
|---|---:|---|
| `SKYN0001` / `slice-shape` | yes | Reports a missing, reordered, or incorrectly typed `Input`, `Output`, `handle`, or `map` spine. |
| `SKYN0002` / `thin-map` | yes | Reports legacy raw route handlers that omit `endpoint(...)`; retained while slices migrate to `mapSlice`. |
| `SKYN0003` / `require-slice-test` | no | Optional inventory smoke reports a missing exact sibling `*.slice.test.ts`; the workspace doctor is authoritative. |
| `SKYN0006` / `no-repository` | yes | Reports application type declarations, import aliases, and constructors named `*Repository` or `*UnitOfWork`. |
| `SKYN0007` / `file-size` | yes | Reports files above 500 nonblank, non-comment effective lines; `{ max }` can lower the ceiling. |
| `SKYN0011` / `tests-under-source` | yes | Reports `*.test.ts`, `*.spec.ts`, `*.proof.ts`, and `*.avp.ts` files outside an exact `src` path segment. |
| `SKYN0018` / `error-code-registry` | yes | Reports stable code literals outside `*.errors.ts`/`defineErrorCodes` and non-member Errors-factory codes. |
| `SKYN0022` / `explicit-slice-contract` | yes | Reports missing `defineContract`/`mapSlice`, raw router/`endpoint` mapping, and omitted or nonliteral `auth`/`kind`. |

Every rule message begins with its public `SKYN####` ID. The default export and named `ruleIds` export expose the
stable rule-name-to-ID map for integrations.

`SKYN0003` is deliberately absent from `flat/recommended`: ESLint cannot authoritatively prove a sibling exists from
one syntax tree. The asynchronous workspace doctor owns that join. For a bounded smoke, enable the rule and supply an
already-built normalized inventory; the plugin itself never reads the filesystem:

```js
{
  settings: { "skies-node": { testFiles: ["/app/src/health.slice.test.ts"] } },
  rules: { "skies-node/require-slice-test": "error" },
}
```

The same inventory can be passed as the rule option `{ testFiles: [...] }`. Remove the plugin and the application
still compiles and runs; only enforcement disappears. Orphan error codes, ownership, registration, and other
cross-file relationships remain workspace-doctor concerns rather than ESLint rules.
