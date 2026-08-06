interface ManifestCriterion {
  readonly id: string;
  readonly statement: string;
}

interface ManifestProof {
  readonly id: string;
  readonly kind: "unit" | "journey";
  readonly lane: string;
  readonly criteria: readonly string[];
  readonly sourceScopes: readonly string[];
  readonly dependsOn: readonly string[];
  readonly description: string;
}

/** Add one generated slice obligation without weakening or reformatting unrelated manifest data. */
export function registerGeneratedProof(
  source: string,
  input: {
    readonly proofId: string;
    readonly criterionId: string;
    readonly statement: string;
    readonly kind: "unit" | "journey";
    readonly sourceScopes: readonly string[];
  },
): string {
  let parsed: unknown;
  try { parsed = JSON.parse(source) as unknown; } catch (error) {
    throw new Error(`skies.node.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("skies.node.json must be an object");
  }
  const manifest = parsed as Record<string, unknown>;
  if (!Array.isArray(manifest.criteria) || !Array.isArray(manifest.proofs) || !Array.isArray(manifest.lanes)) {
    throw new Error("skies.node.json requires criteria, proofs, and lanes arrays");
  }
  const criteria = manifest.criteria as ManifestCriterion[];
  const proofs = manifest.proofs as ManifestProof[];
  if (criteria.some((item) => item?.id === input.criterionId)) {
    throw new Error(`skies.node.json already declares criterion '${input.criterionId}'`);
  }
  if (proofs.some((item) => item?.id === input.proofId)) {
    throw new Error(`skies.node.json already declares proof '${input.proofId}'`);
  }
  const lane = manifest.lanes.find((item): item is { readonly id: string } =>
    item !== null && typeof item === "object" && !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).id === "string");
  if (!lane) throw new Error("skies.node.json requires at least one valid lane before generating a slice");
  manifest.criteria = [...criteria, { id: input.criterionId, statement: input.statement }];
  manifest.proofs = [...proofs, {
    id: input.proofId,
    kind: input.kind,
    lane: lane.id,
    criteria: [input.criterionId],
    sourceScopes: [...input.sourceScopes],
    dependsOn: [],
    description: `Generated ${input.kind} proof for ${input.criterionId}`,
  }];
  return `${JSON.stringify(manifest, null, 2)}
`;
}
