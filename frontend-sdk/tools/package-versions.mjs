// Published frontend packages that every Skies pilot with a frontend must consume together.
// This file ships inside skies-frontend-sdk, making the sync check independent of a sibling
// framework checkout and therefore effective in CI as well as on a developer machine.
export const FRONTEND_PACKAGE_VERSIONS = Object.freeze([
  Object.freeze({ name: "skies-frontend-sdk", version: "4.1.1" }),
  Object.freeze({ name: "assay-design", version: "0.4.3" }),
  Object.freeze({ name: "avp-assay", version: "0.4.0" }),
  Object.freeze({ name: "skies-react", version: "4.0.4" }),
  Object.freeze({ name: "eslint-plugin-skies", version: "4.0.4" }),
]);
