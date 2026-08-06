import { filenameOf, isSliceFile } from "../lib/ast.js";

function exportedDeclarations(program) {
  return program.body
    .filter((statement) => statement.type === "ExportNamedDeclaration" && statement.declaration)
    .map((statement) => statement.declaration);
}

function declarationNamed(declarations, name) {
  return declarations.find((declaration) => declaration.id?.name === name) ?? null;
}

export const sliceShape = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0001: a slice exports Input, Output, handle, and map in canonical order." },
    schema: [],
    messages: {
      missing: "SKYN0001: this slice must export `{{name}}`.",
      order: "SKYN0001: export the slice spine in order: Input, Output, handle, map.",
      handleAsync: "SKYN0001: `handle` must be async.",
      handleSignature: "SKYN0001: `handle` must accept `input: Input` first and return `Promise<Result<Output>>`.",
      mapSignature: "SKYN0001: `map` must be synchronous, accept a typed Router first, and return void.",
    },
  },
  create(context) {
    if (!isSliceFile(filenameOf(context))) return {};

    return {
      "Program:exit"(program) {
        const declarations = exportedDeclarations(program);
        const input = declarationNamed(declarations, "Input");
        const output = declarationNamed(declarations, "Output");
        const handle = declarationNamed(declarations, "handle");
        const map = declarationNamed(declarations, "map");
        const required = { Input: input, Output: output, handle, map };

        for (const [name, declaration] of Object.entries(required)) {
          if (!declaration) context.report({ node: program, messageId: "missing", data: { name } });
        }
        if (!input || !output || !handle || !map) return;

        const positions = [input.range[0], output.range[0], handle.range[0], map.range[0]];
        if (!positions.every((position, index) => index === 0 || positions[index - 1] < position)) {
          context.report({ node: program, messageId: "order" });
        }

        const source = context.sourceCode ?? context.getSourceCode();
        if (handle.type !== "FunctionDeclaration" || !handle.async) {
          context.report({ node: handle, messageId: "handleAsync" });
        }
        const firstParameter = handle.params?.[0] ? source.getText(handle.params[0]).replace(/\s/g, "") : "";
        const returnType = handle.returnType ? source.getText(handle.returnType).replace(/\s/g, "") : "";
        if (!/^[A-Za-z_$][\w$]*:Input$/.test(firstParameter) || returnType !== ":Promise<Result<Output>>") {
          context.report({ node: handle, messageId: "handleSignature" });
        }

        const mapFirstParameter = map.params?.[0] ? source.getText(map.params[0]).replace(/\s/g, "") : "";
        const mapReturnType = map.returnType ? source.getText(map.returnType).replace(/\s/g, "") : "";
        if (
          map.type !== "FunctionDeclaration"
          || map.async
          || !/^[A-Za-z_$][\w$]*:(?:Express\.)?Router$/.test(mapFirstParameter)
          || mapReturnType !== ":void"
        ) {
          context.report({ node: map, messageId: "mapSignature" });
        }
      },
    };
  },
};
