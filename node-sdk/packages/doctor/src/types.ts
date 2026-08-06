/** Public diagnostic identifiers emitted by the workspace doctor. */
export type RuleId =
  | "SKYN0003"
  | "SKYN0004"
  | "SKYN0005"
  | "SKYN0008"
  | "SKYN0010"
  | "SKYN0012"
  | "SKYN0015"
  | "SKYN0016"
  | "SKYN0017"
  | "SKYN0019"
  | "SKYN0020"
  | "SKYN0023"
  | "SKYN0030"
  | "SKYN0031"
  | "SKYN0032"
  | "SKYN0033";

/** A deterministic convention violation. */
export interface Finding {
  /** Stable public rule identifier. */
  readonly code: RuleId;
  /** Workspace-relative path using forward slashes. */
  readonly path: string;
  /** One-based source line. */
  readonly line: number;
  /** One-based source column. */
  readonly column: number;
  /** Actionable explanation of the violated convention. */
  readonly message: string;
}

/** A filesystem or syntax problem that prevented a complete inspection. */
export interface InspectionIssue {
  /** Workspace-relative path using forward slashes. */
  readonly path: string;
  /** Explanation of the incomplete inspection. */
  readonly message: string;
}

/** The complete, sorted result of inspecting one application workspace. */
export interface InspectionResult {
  /** Absolute workspace path. */
  readonly root: string;
  /** Convention violations, sorted by path and source location. */
  readonly findings: readonly Finding[];
  /** Problems that make the result incomplete, sorted by path and message. */
  readonly incomplete: readonly InspectionIssue[];
}

/** Streams used by the CLI, injectable for direct tests and embedding. */
export interface CliIo {
  /** Write ordinary command output. */
  readonly out: (message: string) => void;
  /** Write command usage errors. */
  readonly error: (message: string) => void;
}
