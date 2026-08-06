import { readFile } from "node:fs/promises";
import path from "node:path";
import { apply, type FilePlan, type FilePlanFile } from "./file-plan.js";
import { sourceRoot, type GeneratorOptions } from "./naming.js";
import { registerGeneratedProof } from "./proof-registry.js";
import { authAugmentErrorSource, emailSource, oauthSource, otpSource, type AuthAugment } from "./templates-auth-augment.js";
import { authProofSource } from "./templates-auth-proofs.js";

export interface GenerateAuthAugmentOptions extends GeneratorOptions {
  readonly mode: AuthAugment;
}

function missing(caught: unknown): boolean {
  return (caught as NodeJS.ErrnoException).code === "ENOENT";
}

function sourceFor(mode: AuthAugment): string {
  if (mode === "otp") return otpSource();
  if (mode === "oauth") return oauthSource();
  return emailSource();
}

/** Add one focused auth flow only after the base token boundary exists. */
export async function generateAuthAugment(options: GenerateAuthAugmentOptions): Promise<readonly string[]> {
  const roots = sourceRoot(options);
  const prerequisite = path.join(roots.source, "wiring", "auth.ts");
  await readFile(prerequisite).catch((caught: unknown) => {
    if (missing(caught)) throw new Error(`${prerequisite} does not exist; run g auth first`);
    throw caught;
  });

  const criterion = `auth.${options.mode}.secure`;
  const wiring = path.join(roots.source, "wiring");
  const errorsFile = path.join(wiring, `auth-${options.mode}.errors.ts`);
  const sourceFile = path.join(wiring, `auth-${options.mode}.ts`);
  const proofFile = path.join(wiring, `auth-${options.mode}.test.ts`);
  const files: FilePlanFile[] = [
    { target: errorsFile, contents: authAugmentErrorSource(options.mode) },
    { target: sourceFile, contents: sourceFor(options.mode) },
    { target: proofFile, contents: authProofSource(options.mode, criterion) },
  ];
  const manifestFile = path.join(roots.cwd, "skies.node.json");
  const manifestBytes = await readFile(manifestFile).catch((caught: unknown) => {
    if (missing(caught)) return undefined;
    throw caught;
  });
  if (manifestBytes !== undefined) {
    const manifestSource = manifestBytes.toString("utf8");
    if (!Buffer.from(manifestSource, "utf8").equals(manifestBytes)) {
      throw new Error(`${manifestFile} is not valid UTF-8`);
    }
    const relative = (target: string): string => path.relative(roots.cwd, target).split(path.sep).join("/");
    files.push({
      target: manifestFile,
      contents: registerGeneratedProof(manifestSource, {
        proofId: `auth-${options.mode}-unit`,
        criterionId: criterion,
        statement: `${options.mode.toUpperCase()} auth expires and rejects replay without storing raw credentials.`,
        kind: "unit",
        sourceScopes: [relative(errorsFile), relative(sourceFile), relative(proofFile)],
      }),
      expectedContents: manifestBytes,
    });
  }
  const plan: FilePlan = { root: roots.cwd, files };
  return apply(plan, { dryRun: options.dryRun ?? false });
}

export type { AuthAugment } from "./templates-auth-augment.js";
