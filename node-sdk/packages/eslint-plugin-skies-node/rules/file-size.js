function effectiveLines(source) {
  const text = source.getText();
  const visible = text.split("");
  for (const comment of source.getAllComments()) {
    if (!comment.range) continue;
    for (let offset = comment.range[0]; offset < comment.range[1]; offset += 1) {
      if (visible[offset] !== "\n" && visible[offset] !== "\r") visible[offset] = " ";
    }
  }
  return visible.join("").split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0).length;
}

export const fileSize = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0007: source files contain at most 500 effective lines." },
    schema: [{
      type: "object",
      properties: { max: { type: "integer", minimum: 1 } },
      additionalProperties: false,
    }],
    messages: {
      tooLong: "SKYN0007: file has {{actual}} effective lines; the ceiling is {{max}}. Extract a concern.",
    },
  },
  create(context) {
    const max = context.options[0]?.max ?? 500;
    return {
      "Program:exit"(program) {
        const actual = effectiveLines(context.sourceCode ?? context.getSourceCode());
        if (actual > max) context.report({ node: program, messageId: "tooLong", data: { actual, max } });
      },
    };
  },
};
