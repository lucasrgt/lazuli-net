import { evaluateRules } from "./rules.js";
import { scanWorkspace } from "./scan.js";
import type { CliIo, Finding, InspectionIssue, InspectionResult } from "./types.js";

export type { CliIo, Finding, InspectionIssue, InspectionResult, RuleId } from "./types.js";

const help = `Skies Node.js workspace doctor

Usage:
  skies-node-doctor [workspace] [--json]

Options:
  --json       write the deterministic result as JSON
  -h, --help   show this help

Exit codes:
  0  pass
  1  convention findings remain
  2  inspection was incomplete
`;

const defaultIo: CliIo = {
  out: (message) => console.log(message),
  error: (message) => console.error(message),
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    compareText(left.path, right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function compareIssues(left: InspectionIssue, right: InspectionIssue): number {
  return compareText(left.path, right.path) || compareText(left.message, right.message);
}

/**
 * Inspect one application workspace using independent TypeScript syntax trees and deterministic filesystem facts.
 *
 * The function never creates a TypeScript Program or language service. A missing or unreadable `src` tree is
 * reported through `incomplete`, allowing callers to distinguish an invalid convention from an unfinished scan.
 */
export async function inspectWorkspace(root: string = process.cwd()): Promise<InspectionResult> {
  const facts = await scanWorkspace(root);
  const evaluated = await evaluateRules(facts);
  return {
    root: facts.displayRoot,
    findings: [...evaluated.findings].sort(compareFindings),
    incomplete: [...facts.issues, ...evaluated.issues].sort(compareIssues),
  };
}

function status(result: InspectionResult): "pass" | "findings" | "incomplete" {
  if (result.incomplete.length > 0) return "incomplete";
  return result.findings.length > 0 ? "findings" : "pass";
}

function writeHuman(result: InspectionResult, io: CliIo): void {
  for (const item of result.findings) {
    io.out(`${item.path}:${item.line}:${item.column} ${item.code} ${item.message}`);
  }
  for (const item of result.incomplete) io.error(`${item.path} [incomplete] ${item.message}`);

  if (result.incomplete.length > 0) {
    io.error(
      `doctor incomplete: ${result.findings.length} finding(s), ${result.incomplete.length} inspection issue(s)`,
    );
  } else if (result.findings.length > 0) {
    io.out(`doctor found ${result.findings.length} convention violation(s)`);
  } else {
    io.out("doctor passed");
  }
}

/** Execute the workspace doctor command and return its documented process exit code. */
export async function run(args: readonly string[], io: CliIo = defaultIo): Promise<0 | 1 | 2> {
  // Help must stay ahead of argument parsing, cwd access, and workspace discovery.
  if (args.includes("--help") || args.includes("-h")) {
    io.out(help);
    return 0;
  }

  const json = args.includes("--json");
  const positional = args.filter((argument) => argument !== "--json" && !argument.startsWith("-"));
  const unknown = args.filter((argument) => argument !== "--json" && argument.startsWith("-"));
  if (unknown.length > 0 || positional.length > 1) {
    io.error("skies-node-doctor: expected at most one workspace path and optional --json; run with --help for usage");
    return 2;
  }

  try {
    const result = await inspectWorkspace(positional[0] ?? process.cwd());
    if (json) io.out(JSON.stringify({ status: status(result), ...result }, undefined, 2));
    else writeHuman(result, io);
    if (result.incomplete.length > 0) return 2;
    return result.findings.length > 0 ? 1 : 0;
  } catch (caught) {
    io.error(`skies-node-doctor: inspection failed: ${caught instanceof Error ? caught.message : String(caught)}`);
    return 2;
  }
}
