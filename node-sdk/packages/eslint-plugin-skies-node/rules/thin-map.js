import {
  filenameOf,
  functionNamedAround,
  isSliceFile,
  routeMethods,
  staticPropertyName,
} from "../lib/ast.js";

export const thinMap = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0002: legacy Express route handlers use the canonical endpoint adapter." },
    schema: [],
    messages: {
      inline: "SKYN0002: keep the Express boundary thin; wrap the route handler with `endpoint(...)`.",
    },
  },
  create(context) {
    if (!isSliceFile(filenameOf(context))) return {};

    return {
      CallExpression(node) {
        const owner = functionNamedAround(node, "map");
        if (!owner) return;
        if (node.callee.type !== "MemberExpression") return;
        if (node.callee.object.type !== "Identifier" || node.callee.object.name !== owner.params[0]?.name) return;
        if (!routeMethods.has(staticPropertyName(node.callee))) return;

        const handlers = node.arguments.slice(1);
        const usesEndpoint = handlers.some(
          (argument) => argument.type === "CallExpression"
            && argument.callee.type === "Identifier"
            && argument.callee.name === "endpoint",
        );
        if (!usesEndpoint) context.report({ node, messageId: "inline" });
      },
    };
  },
};
