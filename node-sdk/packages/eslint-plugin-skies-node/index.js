import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("./package.json");
const routeMethods = new Set(["delete", "get", "patch", "post", "put"]);

function filenameOf(context) {
  return (context.filename ?? context.getFilename()).replaceAll("\\", "/");
}

function isSliceFile(filename) {
  return /\.slice\.[cm]?ts$/.test(filename);
}

function exportedDeclarations(program) {
  return program.body
    .filter((statement) => statement.type === "ExportNamedDeclaration" && statement.declaration)
    .map((statement) => statement.declaration);
}

function declarationNamed(declarations, name) {
  return declarations.find((declaration) => declaration.id?.name === name) ?? null;
}

function functionAround(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "FunctionDeclaration") return current;
  }
  return null;
}

const sliceShape = {
  meta: {
    type: "problem",
    docs: { description: "A slice exports Input, Output, handle, and map in the canonical order." },
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

const thinMap = {
  meta: {
    type: "problem",
    docs: { description: "Express route handlers in a slice map through the canonical endpoint adapter." },
    schema: [],
    messages: {
      inline: "SKYN0002: keep the Express boundary thin; wrap the route handler with `endpoint(...)`.",
    },
  },
  create(context) {
    if (!isSliceFile(filenameOf(context))) return {};

    return {
      CallExpression(node) {
        const owner = functionAround(node);
        if (owner?.id?.name !== "map") return;
        if (node.callee.type !== "MemberExpression" || node.callee.computed) return;
        if (node.callee.object.type !== "Identifier" || node.callee.object.name !== owner.params[0]?.name) return;
        if (node.callee.property.type !== "Identifier" || !routeMethods.has(node.callee.property.name)) return;

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

const requireSliceTest = {
  meta: {
    type: "problem",
    docs: { description: "Every slice carries a co-located executable test." },
    schema: [],
    messages: {
      missing: "SKYN0003: add the co-located test `{{test}}` for this slice.",
    },
  },
  create(context) {
    const filename = filenameOf(context);
    if (!isSliceFile(filename) || filename.startsWith("<")) return {};

    return {
      "Program:exit"(program) {
        const expected = filename.replace(/\.slice\.([cm]?ts)$/, ".slice.test.$1");
        if (!fs.existsSync(expected)) {
          context.report({
            node: program,
            messageId: "missing",
            data: { test: path.basename(expected) },
          });
        }
      },
    };
  },
};

const rules = {
  "slice-shape": sliceShape,
  "thin-map": thinMap,
  "require-slice-test": requireSliceTest,
};

const plugin = {
  meta: { name: "eslint-plugin-skies-node", version },
  rules,
  configs: {},
};

plugin.configs["flat/recommended"] = {
  name: "skies-node/recommended",
  plugins: { "skies-node": plugin },
  rules: Object.fromEntries(Object.keys(rules).map((rule) => [`skies-node/${rule}`, "error"])),
};

export default plugin;
