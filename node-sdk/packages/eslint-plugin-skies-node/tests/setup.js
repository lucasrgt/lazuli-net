import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";

export const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { range: true },
  },
});

export const canonical = `
  export const contract = defineContract({ auth: "anonymous", kind: "app" });
  export interface Input { id: string }
  export interface Output { id: string }
  export async function handle(input: Input): Promise<Result<Output>> { return Result.ok(input); }
  export function map(router: Router): void { mapSlice(router, registry, contract, { toInput: () => ({ id: "1" }), handle }); }
`;
