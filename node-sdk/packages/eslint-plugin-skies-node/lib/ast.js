export const routeMethods = new Set(["delete", "get", "head", "options", "patch", "post", "put"]);

export function filenameOf(context) {
  return (context.filename ?? context.getFilename()).replaceAll("\\", "/");
}

export function isSliceFile(filename) {
  return /\.slice\.[cm]?ts$/.test(filename);
}

export function baseName(filename) {
  return filename.slice(filename.lastIndexOf("/") + 1);
}

export function unwrapExpression(node) {
  let current = node;
  while (current && [
    "ChainExpression",
    "TSAsExpression",
    "TSInstantiationExpression",
    "TSNonNullExpression",
    "TSSatisfiesExpression",
    "TSTypeAssertion",
  ].includes(current.type)) {
    current = current.expression;
  }
  return current;
}

export function staticPropertyName(node) {
  if (!node) return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed && node.property?.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return null;
}

export function objectProperty(object, name) {
  if (object?.type !== "ObjectExpression") return null;
  let found = null;
  for (const property of object.properties) {
    if (property.type !== "Property" || property.kind !== "init") continue;
    const key = property.computed
      ? property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value : null
      : property.key.type === "Identifier" ? property.key.name : property.key.value;
    if (key === name) found = property;
  }
  return found;
}

export function functionNamedAround(node, name) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "FunctionDeclaration" && current.id?.name === name) return current;
    if (
      ["ArrowFunctionExpression", "FunctionExpression"].includes(current.type)
      && current.parent?.type === "VariableDeclarator"
      && current.parent.id?.type === "Identifier"
      && current.parent.id.name === name
    ) {
      return current;
    }
  }
  return null;
}

export function rootIdentifier(node) {
  const current = unwrapExpression(node);
  if (current?.type === "Identifier") return current.name;
  if (current?.type === "MemberExpression") return rootIdentifier(current.object);
  if (current?.type === "CallExpression") return rootIdentifier(current.callee);
  return null;
}

export function isStringLiteral(node) {
  const current = unwrapExpression(node);
  return current?.type === "Literal" && typeof current.value === "string";
}

export function isFrameworkPackageFile(filename) {
  return filename.includes("/node-sdk/packages/");
}
