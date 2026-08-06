import { filenameOf, isFrameworkPackageFile, staticPropertyName, unwrapExpression } from "../lib/ast.js";

function forbiddenName(name) {
  return typeof name === "string"
    && /^[A-Z]/.test(name)
    && (name.endsWith("Repository") || name.endsWith("UnitOfWork"));
}

function declaredName(node) {
  return node.id?.type === "Identifier" ? node.id.name : null;
}

function constructedName(node) {
  const callee = unwrapExpression(node.callee);
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression") return staticPropertyName(callee);
  return null;
}

export const noRepository = {
  meta: {
    type: "problem",
    docs: { description: "SKYN0006: application code does not add Repository or UnitOfWork abstractions." },
    schema: [],
    messages: {
      declaration: "SKYN0006: `{{name}}` reintroduces a Repository/UnitOfWork layer; use the app's data client directly.",
      importAlias: "SKYN0006: imported name or alias `{{name}}` reintroduces a Repository/UnitOfWork layer.",
      construction: "SKYN0006: do not construct `{{name}}`; slices use the app's data client directly.",
    },
  },
  create(context) {
    if (isFrameworkPackageFile(filenameOf(context))) return {};

    function reportDeclaration(node) {
      const name = declaredName(node);
      if (forbiddenName(name)) context.report({ node: node.id, messageId: "declaration", data: { name } });
    }

    return {
      ClassDeclaration: reportDeclaration,
      ClassExpression: reportDeclaration,
      TSInterfaceDeclaration: reportDeclaration,
      TSTypeAliasDeclaration: reportDeclaration,
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          const imported = specifier.type === "ImportSpecifier"
            ? specifier.imported.name ?? specifier.imported.value
            : null;
          const local = specifier.local?.name;
          const name = forbiddenName(local) ? local : forbiddenName(imported) ? imported : null;
          if (name) context.report({ node: specifier, messageId: "importAlias", data: { name } });
        }
      },
      NewExpression(node) {
        const name = constructedName(node);
        if (forbiddenName(name)) context.report({ node: node.callee, messageId: "construction", data: { name } });
      },
    };
  },
};
