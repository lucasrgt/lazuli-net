export const PROOF_KINDS = ["unit", "integration", "e2e", "journey"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export interface Criterion {
  readonly id: string;
  readonly statement: string;
}

export interface Lane {
  readonly id: string;
  readonly command: readonly [string, ...string[]];
  readonly timeoutMs: number;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface Proof {
  readonly id: string;
  readonly kind: ProofKind;
  readonly lane: string;
  readonly criteria: readonly string[];
  readonly sourceScopes: readonly string[];
  readonly dependsOn: readonly string[];
  readonly description: string;
}

export interface FoundationConfig {
  readonly schemaVersion: 1;
  readonly criteria: readonly Criterion[];
  readonly lanes: readonly Lane[];
  readonly proofs: readonly Proof[];
  readonly ignoreScopes: readonly string[];
  readonly forceFullScopes: readonly string[];
  readonly gitBase: string;
  readonly path: string;
  readonly root: string;
  readonly fingerprint: string;
}

export type GateMode = "affected" | "staged" | "full";
export type ProofOutcome = "pass" | "fail" | "not-run" | "not-affected" | "no-proof";

export interface CommandRequest {
  readonly command: readonly [string, ...string[]];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly forwardOutput: boolean;
}

export interface CommandResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}

export type CommandRunner = (request: CommandRequest) => Promise<CommandResult>;

export interface GitClient {
  changedPaths(root: string, baseRevision: string): Promise<readonly string[]>;
  /** Paths present in the Git index (staged diff). */
  stagedPaths(root: string): Promise<readonly string[]>;
  /** Committed diff between a base revision and HEAD (explicit pre-push scope). */
  baseDiffPaths(root: string, baseRevision: string): Promise<readonly string[]>;
}

export interface LaneReceipt {
  readonly id: string;
  readonly command: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly proofIds: readonly string[];
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}

export interface ProofReceipt {
  readonly id: string;
  readonly kind: ProofKind;
  readonly lane: string;
  readonly criteria: readonly string[];
  readonly outcome: Exclude<ProofOutcome, "no-proof">;
}

export interface MatrixRow {
  readonly criterion: string;
  readonly statement: string;
  readonly proofIds: readonly string[];
  readonly outcome: ProofOutcome | "covered";
}

export interface GateReceipt {
  readonly schemaVersion: 1;
  readonly type: "skies-node-foundation-gate";
  readonly config: string;
  readonly configFingerprint: string;
  readonly mode: GateMode;
  readonly fast: boolean;
  readonly baseRevision: string | null;
  readonly changedPaths: readonly string[];
  readonly selectionReasons: readonly string[];
  readonly selectedProofs: readonly string[];
  readonly proofResults: readonly ProofReceipt[];
  readonly lanes: readonly LaneReceipt[];
  readonly matrix: readonly MatrixRow[];
  readonly findings: readonly string[];
  readonly verdict: "green" | "red" | "no-changes";
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface GateOptions {
  readonly root: string;
  readonly configPath?: string;
  readonly mode: GateMode;
  readonly changedPaths?: readonly string[];
  /** Explicit base revision freezing affected selection to base...HEAD. */
  readonly baseRevision?: string;
  readonly mergeBase?: string;
  /** Defer exhaustive fallbacks (force-full and unmapped widening) to authoritative CI. */
  readonly fast?: boolean;
  readonly reportPath?: string | false;
  readonly markdownPath?: string | false;
  readonly forwardOutput?: boolean;
}

export interface GateDependencies {
  readonly runner?: CommandRunner;
  readonly git?: GitClient;
  readonly now?: () => Date;
}

export interface GateRun {
  readonly exitCode: 0 | 1;
  readonly receipt: GateReceipt;
  readonly human: string;
  readonly markdown: string;
}

export class FoundationError extends Error {
  constructor(message: string, readonly code: "config" | "invocation" | "io" = "config") {
    super(message);
    this.name = "FoundationError";
  }
}
