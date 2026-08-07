import plugin from "../index.js";
import { ruleTester } from "./setup.js";

ruleTester.run("file-size", plugin.rules["file-size"], {
  valid: [
    { code: `const one = 1;

// comment
/* block
comment */
const two = 2;`, options: [{ max: 2 }] },
    { code: Array.from({ length: 500 }, (_, index) => `const value${index} = ${index};`).join("\n") },
  ],
  invalid: [
    {
      code: `const one = 1;
// ignored
const two = 2; /* trailing */

const three = 3;`,
      options: [{ max: 2 }],
      errors: [{ messageId: "tooLong", data: { actual: 3, max: 2 } }],
    },
    {
      code: Array.from({ length: 501 }, (_, index) => `const value${index} = ${index};`).join("\n"),
      errors: [{ messageId: "tooLong", data: { actual: 501, max: 500 } }],
    },
  ],
});

ruleTester.run("tests-under-source", plugin.rules["tests-under-source"], {
  valid: [
    { filename: "/app/src/modules/wallet.slice.test.ts", code: `test("works", () => {});` },
    { filename: "src/proofs/wallet.proof.mts", code: `export const proof = true;` },
    { filename: "/app/src/proofs/wallet.avp.ts", code: `export const proof = true;` },
    { filename: "/app/tests/test-app.ts", code: `export class TestApp {}` },
    { filename: "/repo/node-sdk/packages/eslint-plugin-skies-node/index.test.js", code: `test("plugin", () => {});` },
    { code: `test("virtual fixture", () => {});` },
  ],
  invalid: [
    {
      filename: "/app/tests/wallet.slice.test.ts",
      code: `test("detached", () => {});`,
      errors: [{ messageId: "detached" }],
    },
    {
      filename: "C:\\app\\proofs\\wallet.proof.ts",
      code: `export const proof = true;`,
      errors: [{ messageId: "detached" }],
    },
    {
      filename: "/app/source/wallet.spec.tsx",
      code: `export const proof = <div />;`,
      errors: [{ messageId: "detached" }],
    },
    {
      filename: "/app/proofs/wallet.avp.ts",
      code: `export const proof = true;`,
      errors: [{ messageId: "detached" }],
    },
  ],
});
