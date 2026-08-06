import {
  filenameOf,
  functionNamedAround,
  isSliceFile,
  isStringLiteral,
  objectProperty,
  rootIdentifier,
  routeMethods,
  staticPropertyName,
  unwrapExpression,
} from "../lib/ast.js";

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

function rawRoute(node, map) {
  const callee = unwrapExpression(node.callee);
  if (callee?.type !== "MemberExpression" || !routeMethods.has(staticPropertyName(callee))) return false;
  const router = map.params[0]?.type === "Identifier" ? map.params[0].name : null;
  return router !== null && rootIdentifier(callee.object) === router;
}

function explicitProperty(context, call, name) {
  const argument = unwrapExpression(call.arguments[0]);
  if (argument?.type !== "ObjectExpression") {
    context.report({ node: argument ?? call, messageId: `${name}Literal` });
    return;
  }
  const property = objectProperty(argument, name);
  if (!property) {
    context.report({ node: argument, messageId: `${name}Missing` });
  } else if (!isStringLiteral(property.value)) {
    context.report({ node: property.value, messageId: `${name}Literal` });
  }
}

export const explicitSliceContract = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0022: slice transport uses defineContract and mapSlice with explicit auth and kind." },
    schema: [],
    messages: {
      contractMissing: "SKYN0022: this slice must declare its transport with `defineContract(...)`.",
      mappingMissing: "SKYN0022: `map` must register the contract through `mapSlice(...)`.",
      rawRoute: "SKYN0022: raw router verb mapping is not a slice contract; use `mapSlice(...)`.",
      rawEndpoint: "SKYN0022: raw `endpoint(...)` mapping is not a slice contract; use `mapSlice(...)`.",
      authMissing: "SKYN0022: `defineContract` must include an explicit `auth` property.",
      authLiteral: "SKYN0022: contract `auth` must be a local string literal; runtime validation remains authoritative.",
      kindMissing: "SKYN0022: `defineContract` must include an explicit `kind` property.",
      kindLiteral: "SKYN0022: contract `kind` must be a local string literal; runtime validation remains authoritative.",
    },
  },
  create(context) {
    if (!isSliceFile(filenameOf(context))) return {};
    const defineNames = new Set(["defineContract"]);
    const openApiNamespaces = new Set();
    const mapNames = new Set(["mapSlice"]);
    const expressNamespaces = new Set();
    const endpointNames = new Set(["endpoint"]);
    const contractCalls = [];
    const rawRoutes = new WeakSet();
    const endpointCalls = [];
    let mapFunction = null;
    let hasMapSlice = false;

    return {
      ImportDeclaration(node) {
        const moduleName = node.source.value;
        for (const specifier of node.specifiers) {
          if (moduleName === "@skiesjs/openapi") {
            if (importedName(specifier) === "defineContract") defineNames.add(specifier.local.name);
            if (specifier.type === "ImportNamespaceSpecifier") openApiNamespaces.add(specifier.local.name);
          }
          if (moduleName === "@skiesjs/express") {
            if (importedName(specifier) === "mapSlice") mapNames.add(specifier.local.name);
            if (importedName(specifier) === "endpoint") endpointNames.add(specifier.local.name);
            if (specifier.type === "ImportNamespaceSpecifier") expressNamespaces.add(specifier.local.name);
          }
        }
      },
      FunctionDeclaration(node) {
        if (node.id?.name === "map") mapFunction = node;
      },
      CallExpression(node) {
        if (namedCall(node, defineNames, openApiNamespaces, "defineContract")) {
          contractCalls.push(node);
          explicitProperty(context, node, "auth");
          explicitProperty(context, node, "kind");
        }

        const map = functionNamedAround(node, "map");
        if (!map) return;
        mapFunction ??= map;
        if (namedCall(node, mapNames, expressNamespaces, "mapSlice")) hasMapSlice = true;
        if (rawRoute(node, map)) {
          rawRoutes.add(node);
          context.report({ node, messageId: "rawRoute" });
        }
        if (namedCall(node, endpointNames, expressNamespaces, "endpoint")) endpointCalls.push(node);
      },
      "Program:exit"(program) {
        if (contractCalls.length === 0) context.report({ node: program, messageId: "contractMissing" });
        if (mapFunction && !hasMapSlice) context.report({ node: mapFunction, messageId: "mappingMissing" });
        for (const call of endpointCalls) {
          let covered = false;
          for (let current = call.parent; current; current = current.parent) {
            if (current.type === "CallExpression" && rawRoutes.has(current)) covered = true;
            if (current === mapFunction) break;
          }
          if (!covered) context.report({ node: call, messageId: "rawEndpoint" });
        }
      },
    };
  },
};
