import { expect, it } from "vitest";
import type { TestModule } from "vitest/node";
import { JourneyPath, TestKind } from "./index.js";
import { proofVerdict } from "./reporter.js";

function moduleWith(tests: readonly {
  readonly name: string;
  readonly state: "passed" | "failed" | "skipped" | "pending";
  readonly metadata?: { readonly kind: TestKind };
}[]): TestModule {
  return {
    relativeModuleId: "src/proof.test.ts",
    children: {
      *allTests() {
        for (const test of tests) {
          yield {
            fullName: test.name,
            result: () => ({ state: test.state }),
            meta: () => ({ skies: test.metadata }),
          };
        }
      },
    },
  } as unknown as TestModule;
}

it("produces a stable green inventory only for executed tagged proofs", () => {
  expect(proofVerdict([moduleWith([{ name: "works", state: "passed", metadata: { kind: TestKind.Unit } }])]))
    .toEqual({
      schemaVersion: 1,
      tests: [{
        module: "src/proof.test.ts", name: "works", state: "passed", kind: "unit", journey: null,
      }],
      findings: [],
      verdict: "green",
    });
});

it("rejects empty, skipped, pending, failed, untagged, and unhandled inventories", () => {
  expect(proofVerdict([]).findings).toEqual(["Vitest collected no proof"]);
  const receipt = proofVerdict([moduleWith([
    { name: "skipped", state: "skipped", metadata: { kind: TestKind.E2E } },
    { name: "pending", state: "pending", metadata: { kind: TestKind.Integration } },
    { name: "failed", state: "failed", metadata: { kind: TestKind.Unit } },
    { name: "untagged", state: "passed" },
  ])], [new Error("outside")]);

  expect(receipt.verdict).toBe("red");
  expect(receipt.findings).toHaveLength(5);
  expect(receipt.findings.join("\n")).toContain("verdict is skipped");
  expect(receipt.findings.join("\n")).toContain("metadata is missing");
  expect(receipt.findings.at(-1)).toContain("unhandled error");
  expect(JourneyPath.Happy).toBe("happy");
});
