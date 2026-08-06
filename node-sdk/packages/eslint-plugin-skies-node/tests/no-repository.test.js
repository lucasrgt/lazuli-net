import plugin from "../index.js";
import { ruleTester } from "./setup.js";

ruleTester.run("no-repository", plugin.rules["no-repository"], {
  valid: [
    { code: `import { pgTable } from "drizzle-orm/pg-core"; const UserRepository = pgTable("users", {});` },
    { code: `interface RepositoryMetadata {} type UnitOfWorkResult = { ok: true };` },
    { code: `export function UserRepository() { return {}; } const userRepository = () => ({});` },
    { code: `import { createUserRepository } from "./wallets.js"; createUserRepository();` },
    {
      filename: "/repo/node-sdk/packages/core/src/internal.ts",
      code: `export interface FrameworkRepository {}`,
    },
  ],
  invalid: [
    {
      code: `interface IUserRepository { find(): void } class BillingUnitOfWork {}`,
      errors: [
        { messageId: "declaration", data: { name: "IUserRepository" } },
        { messageId: "declaration", data: { name: "BillingUnitOfWork" } },
      ],
    },
    {
      code: `type WalletRepository = { find(): void };`,
      errors: [{ messageId: "declaration", data: { name: "WalletRepository" } }],
    },
    {
      code: `import UserRepository from "./user.js"; import { Store as BillingUnitOfWork } from "./billing.js";`,
      errors: [
        { messageId: "importAlias", data: { name: "UserRepository" } },
        { messageId: "importAlias", data: { name: "BillingUnitOfWork" } },
      ],
    },
    {
      code: `import { UserRepository as Store } from "./user.js";`,
      errors: [{ messageId: "importAlias", data: { name: "UserRepository" } }],
    },
    {
      code: `const first = new UserRepository(); const second = new Infra.UnitOfWork();`,
      errors: [
        { messageId: "construction", data: { name: "UserRepository" } },
        { messageId: "construction", data: { name: "UnitOfWork" } },
      ],
    },
  ],
});
