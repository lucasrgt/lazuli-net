import type { FoundationConfig, GateReceipt, MatrixRow, ProofOutcome } from "./types.js";

export interface InventoryProof {
  readonly id: string;
  readonly kind: string;
  readonly lane: string;
  readonly command: readonly string[];
  readonly timeoutMs: number;
  readonly criteria: readonly string[];
  readonly sourceScopes: readonly string[];
  readonly dependsOn: readonly string[];
}

export interface Inventory {
  readonly schemaVersion: 1;
  readonly configFingerprint: string;
  readonly criteria: readonly { readonly id: string; readonly statement: string }[];
  readonly proofs: readonly InventoryProof[];
  readonly counts: Readonly<Record<"unit" | "integration" | "e2e" | "journey", number>>;
}

export function buildInventory(config: FoundationConfig): Inventory {
  const lanes = new Map(config.lanes.map((lane) => [lane.id, lane]));
  const counts = { unit: 0, integration: 0, e2e: 0, journey: 0 };
  const proofs = config.proofs.map((proof) => {
    counts[proof.kind]++;
    const lane = lanes.get(proof.lane);
    if (lane === undefined) throw new Error(`validated lane '${proof.lane}' disappeared`);
    return {
      id: proof.id, kind: proof.kind, lane: proof.lane, command: lane.command,
      timeoutMs: lane.timeoutMs, criteria: proof.criteria, sourceScopes: proof.sourceScopes,
      dependsOn: proof.dependsOn,
    };
  });
  return { schemaVersion: 1, configFingerprint: config.fingerprint, criteria: config.criteria, proofs, counts };
}

export function inventoryHuman(inventory: Inventory): string {
  const lines = [
    `Skies Node proof inventory — ${inventory.proofs.length} proof(s), ${inventory.criteria.length} criterion/criteria`,
    `  unit=${inventory.counts.unit} integration=${inventory.counts.integration} e2e=${inventory.counts.e2e} journey=${inventory.counts.journey}`,
  ];
  for (const proof of inventory.proofs) {
    lines.push(`  ${proof.id} [${proof.kind}] lane=${proof.lane} timeout=${proof.timeoutMs}ms`);
    lines.push(`    criteria: ${proof.criteria.join(", ")}`);
    lines.push(`    scopes: ${proof.sourceScopes.join(", ")}`);
    lines.push(`    command: ${JSON.stringify(proof.command)}`);
  }
  return `${lines.join("\n")}
`;
}

export function coverageRows(config: FoundationConfig): MatrixRow[] {
  return config.criteria.map((criterion) => {
    const proofIds = config.proofs.filter((proof) => proof.criteria.includes(criterion.id)).map((proof) => proof.id);
    return {
      criterion: criterion.id,
      statement: criterion.statement,
      proofIds,
      outcome: proofIds.length === 0 ? "no-proof" : "covered",
    };
  });
}

export function criteriaFindings(config: FoundationConfig): string[] {
  const rows = coverageRows(config);
  const findings = rows.filter((row) => row.outcome === "no-proof").map((row) => `criterion '${row.criterion}' has no cited proof`);
  if (config.criteria.length === 0) findings.push("no criteria are declared");
  if (config.proofs.length === 0) findings.push("no proofs are declared");
  return findings;
}

export function matrixFromReceipt(config: FoundationConfig, receipt: GateReceipt): MatrixRow[] {
  const byProof = new Map(receipt.proofResults.map((proof) => [proof.id, proof.outcome]));
  return config.criteria.map((criterion) => {
    const proofs = config.proofs.filter((proof) => proof.criteria.includes(criterion.id));
    const outcomes = proofs.map((proof) => byProof.get(proof.id) ?? "not-run");
    let outcome: ProofOutcome;
    if (proofs.length === 0) outcome = "no-proof";
    else if (outcomes.includes("fail")) outcome = "fail";
    else if (outcomes.includes("not-run")) outcome = "not-run";
    else if (outcomes.includes("pass")) outcome = "pass";
    else outcome = "not-affected";
    return { criterion: criterion.id, statement: criterion.statement, proofIds: proofs.map((proof) => proof.id), outcome };
  });
}

export function matrixHuman(rows: readonly MatrixRow[], heading = "Skies Node criteria matrix"): string {
  const lines = [heading];
  for (const row of rows) {
    lines.push(`  ${row.outcome.toUpperCase().padEnd(12)} ${row.criterion} — ${row.proofIds.join(", ") || "(missing proof)"}`);
  }
  return `${lines.join("\n")}
`;
}
