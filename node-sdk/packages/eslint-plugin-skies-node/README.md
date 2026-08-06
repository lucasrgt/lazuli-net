# eslint-plugin-skies-node

The removable Skies doctor for plain TypeScript backend slices.

```js
import tsParser from "@typescript-eslint/parser";
import skiesNode from "eslint-plugin-skies-node";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser },
  },
  skiesNode.configs["flat/recommended"],
];
```

| Rule | Contract |
|---|---|
| `SKYN0001` / `slice-shape` | `*.slice.ts` exports `Input`, `Output`, `handle`, and `map` in order, with typed signatures. |
| `SKYN0002` / `thin-map` | Express routes use `endpoint(...)`; business behavior stays in `handle`. |
| `SKYN0003` / `require-slice-test` | Every slice has a sibling `*.slice.test.ts`. |

Remove the plugin and the application still compiles and runs; only enforcement disappears.
