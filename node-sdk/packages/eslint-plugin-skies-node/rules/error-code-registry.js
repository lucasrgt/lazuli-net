import {
  filenameOf,
  isFrameworkPackageFile,
  isStringLiteral,
  staticPropertyName,
  unwrapExpression,
} from "../lib/ast.js";

const factoryMethods = new Set([
  "businessRule",
  "conflict",
  "forbidden",
  "internal",
  "notFound",
  "rateLimit",
  "unauthorized",
  "unavailable",
  "validation",
]);
const stableCode = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;

function importedName(specifier) {
  return specifier.type === "ImportSpecifier" ? specifier.imported.name ?? specifier.imported.value : null;
}

function namedCall(node, names, namespaces, exportedName) {
  const callee = unwrapExpression(node.callee);
  if (callee?.type === "Identifier") return names.has(callee.name);
  return callee?.type === "MemberExpression"
    && staticPropertyName(callee) === exportedName
    && callee.object.type === "Identifier"
    && namespaces.has(callee.object.name);
}

function registryMember(node) {
  const value = unwrapExpression(node);
  return value?.type === "MemberExpression"
    && !value.computed
    && value.object.type === "Identifier"
    && value.property.type === "Identifier";
}

function factoryCall(node, objects, namespaces) {
  const callee = unwrapExpression(node.callee);
  if (callee?.type !== "MemberExpression") return null;
  const method = staticPropertyName(callee);
  if (!factoryMethods.has(method)) return null;
  const owner = unwrapExpression(callee.object);
  if (owner?.type === "Identifier" && objects.has(owner.name)) return method;
  if (
    owner?.type === "MemberExpression"
    && staticPropertyName(owner) === "Errors"
    && owner.object.type === "Identifier"
    && namespaces.has(owner.object.name)
  ) {
    return method;
  }
  return null;
}

function directRegistryObject(node, defineNames, openApiNamespaces) {
  const object = node.parent;
  if (object?.type !== "ObjectExpression") return null;
  let argument = object;
  let call = object.parent;
  while (call && unwrapExpression(call) === argument && call.type !== "CallExpression") {
    argument = call;
    call = call.parent;
  }
  return call?.type === "CallExpression"
    && call.arguments[0] === argument
    && namedCall(call, defineNames, openApiNamespaces, "defineErrorCodes")
    ? call
    : null;
}

function variableName(node) {
  return node.id?.type === "Identifier" ? node.id.name : "";
}

function literalValue(node) {
  const value = unwrapExpression(node);
  return value?.type === "Literal" && typeof value.value === "string" ? value.value : null;
}

export const errorCodeRegistry = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0018: stable application error codes are declared by defineErrorCodes in *.errors.ts." },
    schema: [],
    messages: {
      wrongFile: "SKYN0018: `defineErrorCodes` declarations belong in a `*.errors.ts` file.",
      registryShape: "SKYN0018: `defineErrorCodes` requires a direct object of string-literal codes.",
      factory: "SKYN0018: Errors factories consume a registry member identifier, not an inline or indirect code.",
      literal: "SKYN0018: declare stable error-code literals in `*.errors.ts` through `defineErrorCodes`.",
    },
  },
  create(context) {
    const filename = filenameOf(context);
    if (isFrameworkPackageFile(filename)) return {};
    const isErrorsFile = /\.errors\.[cm]?ts$/.test(filename);
    const defineNames = new Set(["defineErrorCodes"]);
    const openApiNamespaces = new Set();
    const errorObjects = new Set(["Errors"]);
    const coreNamespaces = new Set();
    const reported = new WeakSet();

    function report(node, messageId) {
      const target = unwrapExpression(node) ?? node;
      if (reported.has(target)) return;
      reported.add(target);
      context.report({ node: target, messageId });
    }

    function callAbove(node) {
      for (let current = node.parent; current; current = current.parent) {
        if (current.type === "CallExpression") return current;
        if (["Program", "VariableDeclaration", "ExpressionStatement"].includes(current.type)) return null;
      }
      return null;
    }

    return {
      ImportDeclaration(node) {
        const moduleName = node.source.value;
        for (const specifier of node.specifiers) {
          if (moduleName === "@skiesjs/openapi") {
            if (importedName(specifier) === "defineErrorCodes") defineNames.add(specifier.local.name);
            if (specifier.type === "ImportNamespaceSpecifier") openApiNamespaces.add(specifier.local.name);
          }
          if (moduleName === "@skiesjs/core") {
            if (importedName(specifier) === "Errors") errorObjects.add(specifier.local.name);
            if (specifier.type === "ImportNamespaceSpecifier") coreNamespaces.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (namedCall(node, defineNames, openApiNamespaces, "defineErrorCodes")) {
          if (!isErrorsFile) {
            report(node, "wrongFile");
            return;
          }
          const argument = unwrapExpression(node.arguments[0]);
          if (argument?.type !== "ObjectExpression") {
            report(node.arguments[0] ?? node, "registryShape");
            return;
          }
          if (argument.properties.length === 0) return;
          for (const property of argument.properties) {
            if (property.type !== "Property" || property.kind !== "init" || !isStringLiteral(property.value)) {
              report(property.type === "Property" ? property.value : property, "registryShape");
            }
          }
          return;
        }

        const method = factoryCall(node, errorObjects, coreNamespaces);
        if (!method) return;
        const code = node.arguments[0];
        if (!code) return;
        if (method === "validation" && node.arguments.length === 1 && !isStringLiteral(code)) return;
        if (!registryMember(code)) report(code, "factory");
      },
      Property(node) {
        const name = node.computed
          ? node.key.type === "Literal" ? node.key.value : null
          : node.key.type === "Identifier" ? node.key.name : node.key.value;
        const registryCall = directRegistryObject(node, defineNames, openApiNamespaces);
        if (registryCall) return;

        const enclosing = callAbove(node);
        if (name === "code" && enclosing && factoryCall(enclosing, errorObjects, coreNamespaces)) {
          if (!registryMember(node.value)) report(node.value, "factory");
          return;
        }
        const value = literalValue(node.value);
        if (name === "code" && value && stableCode.test(value)) report(node.value, "literal");
      },
      VariableDeclarator(node) {
        const name = variableName(node);
        const direct = literalValue(node.init);
        if (direct && stableCode.test(direct) && (isErrorsFile || /(?:code|error)/i.test(name))) {
          report(node.init, "literal");
        }

        if (!/(?:ErrorCodes?|Errors)$/.test(name)) return;
        const value = unwrapExpression(node.init);
        if (value?.type !== "ObjectExpression") return;
        for (const property of value.properties) {
          if (property.type !== "Property") continue;
          const code = literalValue(property.value);
          if (code !== null) report(property.value, "literal");
        }
      },
    };
  },
};
