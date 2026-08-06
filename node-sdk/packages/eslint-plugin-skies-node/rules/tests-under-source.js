import { baseName, filenameOf } from "../lib/ast.js";

function isTestOrProof(filename) {
  return /\.(?:avp|proof|spec|test)\.[cm]?tsx?$/.test(baseName(filename));
}

function isUnderSource(filename) {
  return filename.split("/").includes("src");
}

export const testsUnderSource = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0011: application tests and proofs live under an exact src path segment." },
    schema: [],
    messages: {
      detached: "SKYN0011: test/proof files live under `src`; detached test trees contain infrastructure only.",
    },
  },
  create(context) {
    const filename = filenameOf(context);
    if (filename.startsWith("<") || !isTestOrProof(filename) || isUnderSource(filename)) return {};
    return { Program(program) { context.report({ node: program, messageId: "detached" }); } };
  },
};
