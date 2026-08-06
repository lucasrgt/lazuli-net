import { baseName, filenameOf, isSliceFile } from "../lib/ast.js";

function inventoryOf(context) {
  const option = context.options[0]?.testFiles;
  const setting = context.settings?.["skies-node"]?.testFiles;
  const files = option ?? setting;
  return Array.isArray(files) && files.every((file) => typeof file === "string")
    ? new Set(files.map((file) => file.replaceAll("\\", "/")))
    : null;
}

export const requireSliceTest = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0003: optional inventory smoke for an exact co-located slice test." },
    schema: [{
      type: "object",
      properties: { testFiles: { type: "array", items: { type: "string" }, uniqueItems: true } },
      additionalProperties: false,
    }],
    messages: {
      missing: "SKYN0003: add the co-located test `{{test}}` for this slice.",
    },
  },
  create(context) {
    const filename = filenameOf(context);
    const inventory = inventoryOf(context);
    if (!isSliceFile(filename) || filename.startsWith("<") || !inventory) return {};

    return {
      "Program:exit"(program) {
        const expected = filename.replace(/\.slice\.([cm]?ts)$/, ".slice.test.$1");
        if (!inventory.has(expected)) {
          context.report({ node: program, messageId: "missing", data: { test: baseName(expected) } });
        }
      },
    };
  },
};
