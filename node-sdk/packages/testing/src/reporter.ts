import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Reporter, TestModule } from "vitest/node";
import type { JourneyDefinition, SkiesTestMetadata } from "./index.js";

export interface ProofVerdictEntry {
  readonly module: string;
  readonly name: string;
  readonly state: "passed" | "failed" | "skipped" | "pending";
  readonly kind: SkiesTestMetadata["kind"] | null;
  readonly journey: JourneyDefinition | null;
}

export interface ProofVerdictReceipt {
  readonly schemaVersion: 1;
  readonly tests: readonly ProofVerdictEntry[];
  readonly findings: readonly string[];
  readonly verdict: "green" | "red";
}

export interface SkiesProofReporterOptions {
  readonly outputFile?: string;
  /** Applications keep this true; framework-internal mixed suites may disable it. */
  readonly requireMetadata?: boolean;
}

/** Build a deterministic verdict inventory from Vitest's actually collected and executed test cases. */
export function proofVerdict(
  modules: ReadonlyArray<TestModule>,
  unhandledErrors: readonly unknown[] = [],
  requireMetadata = true,
): ProofVerdictReceipt {
  const tests: ProofVerdictEntry[] = [];
  for (const module of modules) {
    for (const test of module.children.allTests()) {
      const result = test.result();
      const skies = test.meta().skies;
      tests.push({
        module: module.relativeModuleId.replaceAll("\\", "/"),
        name: test.fullName,
        state: result.state,
        kind: skies?.kind ?? null,
        journey: skies?.journey ?? null,
      });
    }
  }
  tests.sort((left, right) => left.module.localeCompare(right.module) || left.name.localeCompare(right.name));
  const findings: string[] = [];
  if (tests.length === 0) findings.push("Vitest collected no proof");
  for (const test of tests) {
    if (test.state !== "passed") findings.push(`${test.module} > ${test.name}: verdict is ${test.state}`);
    if (requireMetadata && test.kind === null) findings.push(`${test.module} > ${test.name}: @skiesjs/testing metadata is missing`);
  }
  if (unhandledErrors.length > 0) findings.push(`Vitest reported ${unhandledErrors.length} unhandled error(s)`);
  return { schemaVersion: 1, tests, findings, verdict: findings.length === 0 ? "green" : "red" };
}

/** Reporter that makes skipped, disabled, pending, untagged, empty, and unhandled outcomes fail the Vitest process. */
export class SkiesProofReporter implements Reporter {
  readonly #options: SkiesProofReporterOptions;

  public constructor(options: SkiesProofReporterOptions = {}) {
    this.#options = options;
  }

  public async onTestRunEnd(modules: ReadonlyArray<TestModule>, unhandledErrors: readonly unknown[]): Promise<void> {
    const receipt = proofVerdict(modules, unhandledErrors, this.#options.requireMetadata ?? true);
    if (this.#options.outputFile !== undefined) {
      const target = path.resolve(this.#options.outputFile);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    }
    if (receipt.verdict === "red") {
      throw new Error(`Skies proof verdict is red:\n- ${receipt.findings.join("\n- ")}`);
    }
  }
}
