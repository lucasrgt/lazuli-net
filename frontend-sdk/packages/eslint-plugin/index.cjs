"use strict";

const fs = require("fs");
const path = require("path");
const { version } = require("./package.json");

// eslint-plugin-skies — the frontend harness (SKYFE*). The front-side parallel of the backend's Roslyn analyzers
// (Skies.Framework.Doctor): it polices the MVVM seam so React Native + web screens stay wired, not mocked — the View
// renders, the ViewModel is the only data door, and no fixture/mock leaks into production. Doctor-removable: delete
// the plugin and the app still builds; you only lose enforcement. Canonical home: Skies/frontend-sdk.

const GENERATED_CLIENT = /(^|\/)client\.gen(\/|$)/;     // every generated file, including contract models
const GENERATED_OPERATIONS = /(^|\/)client\.gen(?:\/(?!model(?:\/|$))|$)/; // transport/hooks, never model values
const DATA_LIBS = /^(axios)$|^@tanstack\/react-query$/;  // raw transport / the Model layer
const MOCKS = /(^|\/)(__mocks__|fixtures)(\/|$)|^msw($|\/)/;

const isView = (f) => /\.view\.tsx?$/.test(f);
const isViewModel = (f) => /\.viewModel\.ts$/.test(f);
const isTest = (f) => /\.(test|spec)\.[jt]sx?$/.test(f);
const isGenerated = (f) => GENERATED_CLIENT.test(f.replace(/\\/g, "/"));
// The data doors are two: a screen's *.viewModel.ts (per-screen), AND the framework's auth/routing
// infrastructure — session bootstrap + route guards. Both legitimately read the generated client (refresh, me,
// lifecycle); screens still may NOT bypass their ViewModel. Scoped to lib/session + lib/guards so it stays a
// principled allowance, not a general escape hatch. (This is the cross-cutting infra Angular puts behind
// CanActivate / an AuthService — framework primitives the app composes, not a DSL.)
const isInfraDataDoor = (f) => /(^|\/)lib\/(session|guards)(\.|\/)/.test(f.replace(/\\/g, "/"));
// The design band's exemption boundaries (SKYFE024-026, DESIGN-CONVENTIONS.md): the app's ui/ kit implements the
// design vocabulary (it touches host elements and pixel values BY JOB), and the token files define the raw values
// (the same filename pattern SKYFE012 exempts). Everything else speaks roles and scales only.
const isUiKit = (f) => /(^|\/)ui(\/|\.)/.test(f.replace(/\\/g, "/"));
const TOKEN_FILES = /(^|\/|\.)(theme|tokens|palette|colors)(\/|\.|$)/i;

// A type-only import (`import type { X }`) is erased at runtime — it is the shared contract vocabulary, not
// data access. A View taking `kind: LegalDocKind` is wired correctly; only a *value* import (a hook, the
// client) is a data path. So the data-door rules exempt type imports; the contract types are everyone's.
const isTypeOnly = (node) =>
  node.importKind === "type" ||
  (node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === "type"));

// Assay's canonical suffix is still a Vitest suite. Colocation rules accept either form so a feature can promote
// its real integration suite to AVP without duplicating the same test under two filenames.
function coLocatedTestSources(filename, base) {
  const names = [`${base}.test.tsx`, `${base}.assay.test.tsx`];
  const paths = names
    .map((name) => path.join(path.dirname(filename), name))
    .filter((candidate) => fs.existsSync(candidate));
  return { names, sources: paths.map((candidate) => fs.readFileSync(candidate, "utf8")) };
}

/** Report on any *value* import whose source matches `pattern`. */
function forbidImport(context, pattern, messageId) {
  return {
    ImportDeclaration(node) {
      if (!isTypeOnly(node) && pattern.test(node.source.value)) {
        context.report({ node, messageId });
      }
    },
  };
}

// ── Routing vocabulary (recognized for BOTH expo-router and TanStack Router) ────────────────────────────────────
// The routing rules police a SHAPE (declarative redirect, guarded back, param presence), not a router runtime —
// so they recognize each router's idiom but depend on neither. "Ship the standard, not the adapter."

// A route file — the navigation layer (expo-router `app/`, TanStack `app/routes/`). The only layer that may
// redirect or read route params; both routers live under an `app/` tree, so one test covers them.
const isRoute = (f) => /(^|\/)app\//.test(f.replace(/\\/g, "/"));
// The nav seam — the single guarded back handler (safeBack / useGoBack). The one place a bare back() is allowed.
const isNavSeam = (f) => /(^|\/)lib\/(nav|useGoBack)(\.|\/)/.test(f.replace(/\\/g, "/"));
// The "am I signed in?" boolean a guard must NOT branch a redirect on: it collapses the tri-state (loading vs
// anonymous) into one bit, so the redirect fires before the session settles. Branch on a SessionState instead.
const AUTH_BOOL = /^(is)?(authenticated|authed|loggedin|signedin)$/i;
// A route param whose ABSENCE yields a ghost screen — an id the View needs. Optional filter/search params don't
// qualify; only id-shaped names render an empty detail when missing.
const ID_PARAM = /(^id$)|Id$/;

/** Whether `node` sits lexically inside a useEffect / useLayoutEffect callback (where a redirect re-fires every render). */
function inEffect(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      p.type === "CallExpression" &&
      p.callee.type === "Identifier" &&
      (p.callee.name === "useEffect" || p.callee.name === "useLayoutEffect")
    )
      return true;
  }
  return false;
}

/** The nearest enclosing function of `node` (the component body), or null. */
function enclosingFunction(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      p.type === "FunctionDeclaration" ||
      p.type === "FunctionExpression" ||
      p.type === "ArrowFunctionExpression"
    )
      return p;
  }
  return null;
}

/** The leaf name of `x` / `x.y` when it reads as an auth boolean (AUTH_BOOL), else null. */
function authBoolName(expr) {
  if (expr.type === "Identifier" && AUTH_BOOL.test(expr.name)) return expr.name;
  if (
    expr.type === "MemberExpression" &&
    expr.property.type === "Identifier" &&
    AUTH_BOOL.test(expr.property.name)
  )
    return expr.property.name;
  return null;
}

/** Whether a JSX element is a declarative redirect — `<Redirect>` (expo-router) or `<Navigate>` (TanStack). */
function isRedirectElement(arg) {
  if (!arg || arg.type !== "JSXElement") return false;
  const name = arg.openingElement.name;
  return name.type === "JSXIdentifier" && (name.name === "Redirect" || name.name === "Navigate");
}

/** Whether a statement (or block) returns a declarative redirect element. */
function returnsRedirect(stmt) {
  const body = stmt.type === "BlockStatement" ? stmt.body : [stmt];
  return body.some((s) => s.type === "ReturnStatement" && isRedirectElement(s.argument));
}

/** Walk every node under `root` (skipping `parent` back-edges), calling `fn`; `fn` returning true stops the walk. */
function walk(root, fn) {
  let stop = false;
  const visit = (node) => {
    if (stop || !node || typeof node.type !== "string") return;
    if (fn(node) === true) {
      stop = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === "string") visit(v);
    }
  };
  visit(root);
}

/** Whether the identifier `name` appears anywhere in `node`'s subtree (a value reference). */
function identifierAppears(node, name) {
  let found = false;
  walk(node, (n) => (n.type === "Identifier" && n.name === name ? (found = true) : false));
  return found;
}

/**
 * The names that stand in for a param in a presence guard: the param itself plus any local initialized from it —
 * a coalesce (`const x = a ?? param`) or a rename (`const x = param`). Guarding any of them guards the param, so a
 * `const id = a ?? b; if (!id) return <Redirect/>` is recognized, not falsely flagged.
 */
function aliasesOf(fn, base) {
  const names = new Set([base]);
  walk(fn.body, (n) => {
    if (
      n.type === "VariableDeclarator" &&
      n.id.type === "Identifier" &&
      n.init &&
      !names.has(n.id.name) &&
      [...names].some((nm) => identifierAppears(n.init, nm))
    )
      names.add(n.id.name);
    return false;
  });
  return names;
}

/**
 * Whether an `if` test guarantees a redirect when some name in `names` is absent: a bare `!X`, a `||`-chain
 * with `!X` as a disjunct (`!a || !b` redirects when either is missing), or the spine's union check
 * (`X.status === "missing"` off `requiredParam(...)`). `&&` is rejected — `!X && y` does NOT redirect on `X`
 * alone, so it is not a sound presence guard.
 */
function testGuardsAny(test, names) {
  if (test.type === "UnaryExpression" && test.operator === "!" && test.argument.type === "Identifier")
    return names.has(test.argument.name);
  if (test.type === "LogicalExpression" && test.operator === "||")
    return testGuardsAny(test.left, names) || testGuardsAny(test.right, names);
  // The spine's shape: `const id = requiredParam(param); if (id.status === "missing") return <Redirect/>`.
  if (
    test.type === "BinaryExpression" &&
    test.operator === "===" &&
    test.left.type === "MemberExpression" &&
    !test.left.computed &&
    test.left.object.type === "Identifier" &&
    names.has(test.left.object.name) &&
    test.left.property.type === "Identifier" &&
    test.left.property.name === "status" &&
    test.right.type === "Literal" &&
    test.right.value === "missing"
  )
    return true;
  return false;
}

/** Whether `fn`'s body contains `if (<guards X>) return <Redirect/Navigate …/>` for any name X in `names`. */
function hasPresenceGuard(fn, names) {
  let found = false;
  walk(fn.body, (node) => {
    if (node.type === "IfStatement" && testGuardsAny(node.test, names) && returnsRedirect(node.consequent))
      return (found = true);
    return false;
  });
  return found;
}

const rules = {
  // SKYFE001 — a View renders only; it owns no data access. Server data comes from its ViewModel.
  "view-purity": {
    meta: {
      type: "problem",
      docs: { description: "A View (*.view.tsx) imports no data layer; it consumes its ViewModel." },
      messages: {
        impure:
          "SKYFE001: a View renders only — get server data from its ViewModel (*.viewModel.ts), not the client/axios/react-query.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isView(f)) return {};
      return {
        ImportDeclaration(node) {
          if (isTypeOnly(node)) return; // contract types are fine in a View; only data access is not
          const src = node.source.value;
          if (GENERATED_OPERATIONS.test(src) || DATA_LIBS.test(src)) {
            context.report({ node, messageId: "impure" });
          }
        },
      };
    },
  },

  // SKYFE002 — the ViewModel is the only data door: only *.viewModel.ts may import the generated client.
  "data-door": {
    meta: {
      type: "problem",
      docs: { description: "Only a *.viewModel.ts may import the generated client." },
      messages: {
        offdoor:
          "SKYFE002: the generated client is the ViewModel's alone — import it only from a *.viewModel.ts (one data door).",
        laundered:
          "SKYFE002: re-exporting the generated client launders the data door — a helper that `export … from \"client.gen\"` hands every importer the client without ever naming it. The door is the ViewModel; don't re-export the client through anything else.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isViewModel(f) || isGenerated(f) || isInfraDataDoor(f)) return {};
      const isTypeOnlyExport = (node) =>
        node.exportKind === "type" ||
        (node.specifiers?.length > 0 && node.specifiers.every((s) => s.exportKind === "type"));
      return {
        ...forbidImport(context, GENERATED_OPERATIONS, "offdoor"),
        // `export { useThing } from "@/client.gen/x"` / `export * from "@/client.gen/x"` — the import rule's
        // trivial bypass: no import statement, same access handed to every consumer.
        ExportNamedDeclaration(node) {
          if (node.source && !isTypeOnlyExport(node) && GENERATED_OPERATIONS.test(node.source.value))
            context.report({ node, messageId: "laundered" });
        },
        ExportAllDeclaration(node) {
          if (node.exportKind !== "type" && GENERATED_OPERATIONS.test(node.source.value))
            context.report({ node, messageId: "laundered" });
        },
      };
    },
  },

  // SKYFE009 — the ViewModel is platform-agnostic: no react-native / expo import. Platform capabilities
  // (storage, navigation, push) are injected ports, not direct imports — so the ViewModel + the rest of the
  // core (client, types) stay shareable web<->mobile and testable in Vitest (jsdom), with the View the only
  // platform-specific layer.
  "viewmodel-platform-agnostic": {
    meta: {
      type: "problem",
      docs: { description: "A *.viewModel.ts imports no react-native / expo (platform-agnostic core)." },
      messages: {
        platform:
          "SKYFE009: a ViewModel is platform-agnostic — no react-native/expo import. Inject platform capabilities as ports so the core stays shareable web↔mobile.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isViewModel(f)) return {};
      const platform = /^react-native($|\/|-)|^@react-native|^expo($|[-/])/;
      // Flag value AND type imports — an RN type leaks the platform into the agnostic core (a web client has
      // no react-native types), defeating the web↔mobile sharing the rule protects.
      return {
        ImportDeclaration(node) {
          if (platform.test(node.source.value)) context.report({ node, messageId: "platform" });
        },
      };
    },
  },

  // SKYFE005 — every ViewModel has a co-located test that *exercises* it. The triple's third leg: a screen is
  // not done when it renders + has a data door but no proof the wiring mounts. The test need not assert
  // behavior — mounting useXModel() inside QueryClientProvider already compiles the ViewModel against the real
  // generated client and proves the hook is callable without crashing. That is the "wired, not mocked"
  // guarantee, the front-side parallel of the backend's test_discipline. Behavior assertions stay
  // per-screen judgment, never doctor-enforced (that way lies test-theater).
  "test-colocated": {
    meta: {
      type: "problem",
      docs: { description: "Every *.viewModel.ts has a co-located *.test.tsx that renderHook()s it." },
      messages: {
        missing:
          "SKYFE005: a ViewModel needs a co-located test — create {{test}} that renderHook()s {{model}} (prove the wiring mounts; wired, not just typed).",
        inert:
          "SKYFE005: {{test}} exists but doesn't exercise the ViewModel — it must import ./{{base}}.viewModel and call renderHook() (mount the data door against the real client).",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isViewModel(f)) return {};
      return {
        Program(node) {
          const base = path.basename(context.filename).replace(/\.viewModel\.ts$/, "");
          const tests = coLocatedTestSources(context.filename, base);
          if (tests.sources.length === 0) {
            context.report({ node, messageId: "missing", data: { test: tests.names.join(" or "), model: `${base}.viewModel` } });
            return;
          }
          const proven = tests.sources.some(
            (src) => new RegExp(`["']\\./${base}\\.viewModel["']`).test(src) && /\brenderHook\b/.test(src),
          );
          if (!proven) {
            context.report({ node, messageId: "inert", data: { test: tests.names.join(" or "), base } });
          }
        },
      };
    },
  },

  // SKYFE006 — the integration tier: every SCREEN (a *.view.tsx that consumes a ViewModel) has a co-located test
  // that RENDERS the View (not just renderHook on the ViewModel). renderHook (SKYFE005) proves the data door mounts;
  // render(<XView/>) proves the View composes with its ViewModel + children + design system and mounts without
  // crashing — the front-side of the backend's integration tests. Same anti-test-theater line as SKYFE005: presence
  // + that it renders the View is enforced, the assertions stay per-screen judgment. Start as "warn" in an app with
  // a test backlog; promote to "error" once every screen has its render test.
  //
  // SCOPE — the screen unit, detected by the data-door HOOK it imports, not by a sibling file. With the monorepo
  // split the ViewModel lives in a `core` package while the View lives in the platform shell — no longer siblings.
  // A *.view.tsx is a SCREEN when it imports a `use<Name>Model` hook (co-located OR cross-package, e.g. from
  // `@scope/app-core`) — that hook IS the data door. A View that imports no such hook is a presentational FRAGMENT
  // (a wizard step / settings panel that takes its data + form `control` as PROPS from a parent shell); it is
  // covered transitively when its shell renders, so it is skipped. Note: importing only a TYPE from a *.viewModel
  // module (e.g. a shared `PanelProps`) does NOT gate a View — that is props-in, not a data door. The trigger reads
  // off the View's own import statements, surfaced in the lint message and inspectable in source.
  "view-integration-test": {
    meta: {
      type: "problem",
      docs: { description: "Every screen (a *.view.tsx that imports a ViewModel) has a co-located *.test.tsx that render()s the View." },
      messages: {
        missing:
          "SKYFE006: a screen View needs a co-located integration test — create {{test}} that render()s <{{component}}> (prove the screen mounts + composes, not only the ViewModel).",
        inert:
          "SKYFE006: {{test}} exists but doesn't render the View — it must import ./{{base}}.view and call render() (mount the View, not only renderHook the ViewModel).",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isView(f)) return {};
      const base = path.basename(context.filename).replace(/\.view\.tsx$/, "");
      // A View is a SCREEN if it consumes a ViewModel — detected off its import statements so it works whether the
      // ViewModel is co-located (`./X.viewModel`) or in a `core` package (a `use<Name>Model` hook). A View with no
      // such import is a presentational fragment (covered via its shell) — never gated here.
      let consumesViewModel = false;
      return {
        ImportDeclaration(node) {
          // Key on the data-door HOOK specifier (`use<Name>Model`), not the module path. A View that imports a
          // use<Name>Model hook consumes a data door => it is a screen. A View that imports only a TYPE from a
          // *.viewModel module (e.g. a shared `PanelProps`) is props-in (its data arrives from a parent shell) =>
          // a presentational fragment, NOT gated. Keying on the path would wrongly gate those type-only importers.
          for (const s of node.specifiers || []) {
            const name = s.imported?.name ?? s.local?.name ?? "";
            if (/^use[A-Z]\w*Model$/.test(name)) consumesViewModel = true;
          }
        },
        "Program:exit"(node) {
          if (!consumesViewModel) return;
          const tests = coLocatedTestSources(context.filename, base);
          if (tests.sources.length === 0) {
            context.report({ node, messageId: "missing", data: { test: tests.names.join(" or "), component: `${base}View` } });
            return;
          }
          const proven = tests.sources.some(
            (src) => new RegExp(`["']\\./${base}\\.view["']`).test(src) && /\brender\s*\(/.test(src),
          );
          if (!proven) {
            context.report({ node, messageId: "inert", data: { test: tests.names.join(" or "), base } });
          }
        },
      };
    },
  },

  // SKYFE003 — no mock/fixture/MSW import in production code (only under *.test.*).
  "no-mock": {
    meta: {
      type: "problem",
      docs: { description: "No mock/fixture/MSW import outside tests." },
      messages: {
        mock: "SKYFE003: no mock/fixture/MSW in production code — mocks live only under *.test.* (wired, not mocked).",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f)) return {};
      return forbidImport(context, MOCKS, "mock");
    },
  },

  // SKYFE010 — a View routes loading/error/empty through the spine (<Resource> over an AsyncState), never raw
  // react-query booleans. The moment a View hand-reads isPending/isError it has taken on state handling the spine
  // exists to make exhaustive — and the forgotten branch (no empty state, no error UI) is exactly what slips
  // through. So the booleans are the ViewModel's (it projects them via toAsyncState); the View consumes the union.
  "state-completeness": {
    meta: {
      type: "problem",
      docs: { description: "A View handles async state through <Resource>, not raw isPending/isError." },
      messages: {
        raw:
          "SKYFE010: a View routes loading/error/empty through <Resource> (the spine), not raw `{{name}}` — expose the resource as AsyncState in the ViewModel and render it via <Resource>, so every state is handled by construction.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isView(f)) return {};
      const RAW = /^(isPending|isLoading|isError|isFetching|isRefetching|isSuccess)$/;
      return {
        // `query.isPending`
        MemberExpression(node) {
          if (!node.computed && node.property.type === "Identifier" && RAW.test(node.property.name)) {
            context.report({ node: node.property, messageId: "raw", data: { name: node.property.name } });
          }
        },
        // `const { isError } = useFooModel()`
        Property(node) {
          if (
            node.parent.type === "ObjectPattern" &&
            !node.computed &&
            node.key.type === "Identifier" &&
            RAW.test(node.key.name)
          ) {
            context.report({ node: node.key, messageId: "raw", data: { name: node.key.name } });
          }
        },
      };
    },
  },

  // SKYFE011 — every locale in a *.i18n.ts declares the same keys. A feature's copy lives as sibling catalogs
  // (ptBR / esES / enUS …); a key added to one but not the others is a silent untranslated string at runtime. The
  // rule compares the top-level key sets across the file's exported object literals and flags any catalog missing a
  // key its siblings have. (Catalog assembly + the "no hardcoded string" half are the generator's / a later rule's
  // job; this pins parity, the failure that actually ships.)
  "i18n-completeness": {
    meta: {
      type: "problem",
      docs: { description: "Every locale catalog in a *.i18n.ts declares the same keys." },
      messages: {
        missing:
          "SKYFE011: i18n catalog `{{catalog}}` is missing key(s) {{keys}} that sibling locales declare — every locale must carry the same keys.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!/\.i18n\.ts$/.test(f)) return {};
      // Keys are compared as FLATTENED paths ("empty.title"), so a key missing inside a nested group is caught
      // the same as a missing top-level key — nesting is layout, not a parity boundary.
      const keysOf = (objExpr, prefix = "", keys = new Set()) => {
        for (const p of objExpr.properties) {
          if (p.type !== "Property" || p.computed) continue;
          const k = p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null;
          if (k === null) continue;
          let value = p.value;
          while (value && value.type === "TSAsExpression") value = value.expression;
          if (value && value.type === "ObjectExpression") keysOf(value, `${prefix}${k}.`, keys);
          else keys.add(prefix + k);
        }
        return keys;
      };
      return {
        "Program:exit"(program) {
          const catalogs = [];
          for (const stmt of program.body) {
            const decl =
              stmt.type === "ExportNamedDeclaration" && stmt.declaration && stmt.declaration.type === "VariableDeclaration"
                ? stmt.declaration
                : stmt.type === "VariableDeclaration"
                  ? stmt
                  : null;
            if (!decl) continue;
            for (const d of decl.declarations) {
              let init = d.init;
              while (init && init.type === "TSAsExpression") init = init.expression; // unwrap `as const`
              if (init && init.type === "ObjectExpression" && d.id.type === "Identifier") {
                catalogs.push({ name: d.id.name, keys: keysOf(init), node: d });
              }
            }
          }
          if (catalogs.length < 2) return; // need >= 2 locales to compare
          const union = new Set();
          for (const c of catalogs) for (const k of c.keys) union.add(k);
          for (const c of catalogs) {
            const missing = [...union].filter((k) => !c.keys.has(k));
            if (missing.length) {
              context.report({
                node: c.node,
                messageId: "missing",
                data: { catalog: c.name, keys: missing.map((k) => `"${k}"`).join(", ") },
              });
            }
          }
        },
      };
    },
  },

  // SKYFE012 — no inline hex color in production code. Color is a design-system decision; a literal `#3b82f6` in a
  // screen forks the palette and defeats theming (dark mode, white-label). Colors come from a token (the theme),
  // so the only place a hex literal belongs is where the tokens are DEFINED — those files (theme/tokens/palette)
  // are exempt; everywhere else a hex is the smell the rule catches.
  "design-tokens": {
    meta: {
      type: "problem",
      docs: { description: "No inline hex color outside the token/theme definition files." },
      messages: {
        hex: "SKYFE012: no inline hex color (`{{hex}}`) — use a design token from the theme, not a literal.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f) || !/\.(ts|tsx)$/.test(f)) return {};
      if (/(^|\/|\.)(theme|tokens|palette|colors)(\/|\.|$)/i.test(f)) return {}; // token definitions live somewhere
      const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
      return {
        Literal(node) {
          if (typeof node.value === "string" && HEX.test(node.value.trim())) {
            context.report({ node, messageId: "hex", data: { hex: node.value } });
          }
        },
      };
    },
  },

  // SKYFE013 — every mutation surfaces its error. A react-query `.mutate(...)` / `.mutateAsync(...)` whose options
  // object has no `onError` is a SILENT failure: the command fails and the user sees nothing. The front-side of the
  // backend's error_handling discipline — there, a Result's sad path is forced; here, a mutation must route its
  // error somewhere (a toast, a saveError state, a banner). Scoped to *.viewModel.ts (the data door owns commands).
  // It enforces PRESENCE of onError, not what it does (anti-test-theater): wiring the error out is the bar, the
  // UX of it stays per-screen judgment.
  //
  // `{ globalSurface: true }` — for apps running the SKYFE027 mutation defaults: the QueryClient's global
  // MutationCache.onError already routes EVERY failure through the feedback seam (and react-query fires it
  // regardless of per-call handlers), so a bare `.mutate()` is surfaced by construction and the per-call demand
  // would be the redundant second handler this rule refuses to require. The empty `onError: () => {}` stays
  // flagged either way — it is dead paperwork. Set the option only alongside `query-client-defaults: "error"`
  // (SKYFE027 is what makes the claim true).
  "mutation-error-handled": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Every mutation surfaces its failure — via an onError handler, a read .isError state, or a try/catch around mutateAsync (no silent failure). With { globalSurface: true } (the SKYFE027 defaults wired), the global onError is the surface and only an empty onError is flagged.",
      },
      schema: [
        {
          type: "object",
          properties: { globalSurface: { type: "boolean" } },
          additionalProperties: false,
        },
      ],
      messages: {
        unhandled:
          "SKYFE013: a mutation must surface its error (no silent failure; the front-side of the backend's error_handling). Use ANY ONE: pass `onError` to .{{method}}(args, { onError }); OR read `{{name}}.isError` and expose it as state the View renders; OR `await {{name}}.mutateAsync()` inside a try/catch that sets an error surface.",
        empty:
          "SKYFE013: this `onError` swallows the failure — an empty handler is the silent failure with paperwork. Route the error somewhere the user can see (set an error state, show a toast), or read `{{name}}.isError` as state instead.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isViewModel(f)) return {};
      const globalSurface = context.options[0]?.globalSurface === true;
      // The whole-file text lets us see the `.isError` surface pattern: react-query's idiom is to read the mutation
      // handle's `isError`/`error` and expose it as returned state (the View renders it via <ErrorBanner> / toast),
      // which is a real error surface — just not an inline onError. Recognizing it stops the rule demanding a
      // redundant second handler (which would be the very test-theater the rule exists to prevent).
      const src = (context.sourceCode ?? context.getSourceCode()).getText();
      const hasKey = (obj, name) =>
        obj &&
        obj.type === "ObjectExpression" &&
        obj.properties.some(
          (p) =>
            (p.type === "Property" || p.type === "SpreadElement") &&
            (p.type === "SpreadElement" || // a spread may carry onError — don't false-positive
              (!p.computed &&
                ((p.key.type === "Identifier" && p.key.name === name) ||
                  (p.key.type === "Literal" && p.key.value === name)))),
        );
      // mutateAsync REJECTS on failure, so a try/catch around it IS the handler. .mutate() is fire-and-forget (it
      // never throws), so a try/catch around .mutate() catches nothing — only mutateAsync earns this pass. The try
      // must be in the same function as the call (a try in an outer function across a callback boundary doesn't wrap
      // the await), so we stop the walk at the first enclosing function.
      const inTryBlock = (node) => {
        let prev = node;
        for (let n = node.parent; n; prev = n, n = n.parent) {
          if (n.type === "TryStatement" && n.block === prev) return true;
          if (
            n.type === "FunctionDeclaration" ||
            n.type === "FunctionExpression" ||
            n.type === "ArrowFunctionExpression"
          )
            return false;
        }
        return false;
      };
      // mutateAsync(...).catch(...) is the promise-equivalent of the try/catch above — the rejection path is
      // acknowledged. The rule trusts the STRUCTURE (you handled the rejection); whether the handler body is
      // meaningful is the same human judgment as a try/catch body, not something a lint rule should grade.
      const hasCatch = (node) =>
        node.parent &&
        node.parent.type === "MemberExpression" &&
        node.parent.object === node &&
        node.parent.property.type === "Identifier" &&
        node.parent.property.name === "catch" &&
        node.parent.parent &&
        node.parent.parent.type === "CallExpression";
      // A thin wrapper that RETURNS the mutateAsync promise (`(args) => mut.mutateAsync(...)` or `return
      // mut.mutateAsync(...)`) delegates error handling to whoever awaits it — propagation, not a silent swallow.
      // Unwrap `as`-casts / parens that wrap the returned expression.
      const isReturned = (node) => {
        let n = node;
        while (
          n.parent &&
          (n.parent.type === "TSAsExpression" ||
            n.parent.type === "TSNonNullExpression" ||
            n.parent.type === "ParenthesizedExpression")
        )
          n = n.parent;
        const p = n.parent;
        if (!p) return false;
        if (p.type === "ReturnStatement") return true;
        if (p.type === "ArrowFunctionExpression" && p.body === n) return true;
        return false;
      };
      return {
        CallExpression(node) {
          const callee = node.callee;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier") return;
          const method = callee.property.name;
          if (method !== "mutate" && method !== "mutateAsync") return;
          // A) inline onError in the options arg — but an EMPTY handler (`onError: () => {}`) is the silent
          // failure with paperwork: the rule's whole point, defeated by its own escape hatch. Flag it.
          const opts = node.arguments[1];
          if (hasKey(opts, "onError")) {
            const handler = opts.properties.find(
              (p) =>
                p.type === "Property" &&
                !p.computed &&
                ((p.key.type === "Identifier" && p.key.name === "onError") ||
                  (p.key.type === "Literal" && p.key.value === "onError")),
            );
            const fn = handler?.value;
            const objName = callee.object.type === "Identifier" ? callee.object.name : "the mutation";
            if (
              fn &&
              (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression") &&
              fn.body.type === "BlockStatement" &&
              fn.body.body.length === 0
            )
              context.report({ node: handler, messageId: "empty", data: { name: objName } });
            return;
          }
          // With the SKYFE027 defaults wired, the global MutationCache.onError surfaces every failure — a bare
          // call is handled by construction, and only the empty handler above remains worth flagging.
          if (globalSurface) return;
          // B) the mutation handle's error state is read in this file (surfaced as state the View renders).
          const obj = callee.object;
          const name = obj.type === "Identifier" ? obj.name : null;
          if (name && new RegExp(`\\b${name}\\.(isError|error|failureReason)\\b`).test(src)) return;
          // C) mutateAsync awaited inside a try/catch, chained with .catch(), or returned (propagated to the caller).
          if (method === "mutateAsync" && (inTryBlock(node) || hasCatch(node) || isReturned(node))) return;
          context.report({ node, messageId: "unhandled", data: { method, name: name ?? "the mutation" } });
        },
      };
    },
  },

  // SKYFE014 — no hardcoded user-facing copy in a View. Targets JSX text children (the `>text<` between tags) that
  // contain a letter — almost always visible copy that must go through i18n (t()), so it lands in the catalog
  // SKYFE011 then keeps complete across locales. Deliberately scoped to JSXText (high signal, near-zero false
  // positives): `{t("…")}` is an expression (not text) so it's never flagged, and className / testID / name /
  // variant are attributes (not children) so they're never flagged either. The trade-off is COVERAGE not noise —
  // copy hidden in props (placeholder=…) or variables is NOT caught here (a Phase-2 copy-prop whitelist can add
  // it). Warn-first: it surfaces hardcoded strings without crying wolf.
  "no-hardcoded-copy": {
    meta: {
      type: "problem",
      docs: { description: "A View has no hardcoded user-facing text — JSX text goes through i18n (t())." },
      messages: {
        hardcoded:
          'SKYFE014: user-facing text must go through i18n — wrap "{{text}}" in t() (no hardcoded copy in a View).',
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isView(f)) return {};
      // Phase 2: props that carry user-facing copy. Only STRING-LITERAL values are flagged — `{t()}` and variables
      // are JSXExpressionContainers, not literals, so they're never touched. `value`/`name`/`testID`/`variant`/
      // `accessibilityRole` are deliberately NOT here (they're data/ids/enums, not copy).
      const COPY_PROPS = new Set([
        "placeholder", "label", "title", "subtitle", "heading", "description", "message",
        "helperText", "caption", "errorMessage", "emptyTitle", "emptyDescription",
        "accessibilityLabel", "accessibilityHint",
      ]);
      const flag = (node, raw) => {
        const text = raw.trim();
        if (!text || !/[a-zA-Z]/.test(text)) return; // whitespace / numbers / punctuation only
        context.report({
          node,
          messageId: "hardcoded",
          data: { text: text.length > 40 ? `${text.slice(0, 40)}…` : text },
        });
      };
      return {
        JSXText(node) {
          flag(node, node.value);
        },
        JSXAttribute(node) {
          if (node.name.type !== "JSXIdentifier" || !COPY_PROPS.has(node.name.name)) return;
          const v = node.value;
          if (!v || v.type !== "Literal" || typeof v.value !== "string") return; // only literal copy
          flag(v, v.value);
        },
      };
    },
  },

  // SKYFE015 — no imperative redirect inside useEffect. A redirect-on-state belongs in a DECLARATIVE element returned
  // from render (<Redirect> on expo-router, <Navigate> on TanStack), never an effect: an effect runs AFTER paint and
  // re-fires on every re-render. On expo-router web it is catastrophic — the router FREEZES the source screen instead
  // of unmounting it, so the effect loops (replace -> remount target -> refetch a guard's my-X 404 -> re-render ->
  // replace …) into an infinite navigation/refetch loop that crashes the screen (shipped twice in the pilot: Splash,
  // then ChooseRole + 5 screens). On TanStack it is "merely" a post-paint flash + redundant nav. Either way the fix
  // is the same: `if (<terminal state>) return <Redirect/Navigate … />`. Recognizes both idioms — `router.replace` /
  // `router.navigate` (a router instance) and `navigate(...)` bound from TanStack's `useNavigate()`. Imperative
  // push/back on a USER action stay allowed (completions, not render loops). Scoped to the navigating layer.
  "no-router-replace-in-effect": {
    meta: {
      type: "problem",
      docs: {
        description:
          "No imperative redirect (router.replace / router.navigate / a useNavigate() call) inside useEffect — redirect declaratively with <Redirect>/<Navigate> from render (an effect runs after paint and re-fires every render: a flash on TanStack, an infinite loop on expo-router web).",
      },
      messages: {
        effectReplace:
          "SKYFE015: no imperative redirect (`{{call}}`) inside useEffect — it runs after render and re-fires on every re-render (a flash on TanStack; on expo-router web an infinite navigation/refetch loop that crashes the screen). Redirect declaratively instead: `if (<terminal state>) return <Redirect href={…} />;` (expo) / `<Navigate to={…} />` (TanStack).",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isView(f) && !isRoute(f)) return {};
      // Identifiers bound from `useNavigate()` (TanStack) — so a bare `navigate(...)` in an effect is recognized.
      const navigators = new Set();
      return {
        VariableDeclarator(node) {
          if (
            node.id.type === "Identifier" &&
            node.init &&
            node.init.type === "CallExpression" &&
            node.init.callee.type === "Identifier" &&
            node.init.callee.name === "useNavigate"
          )
            navigators.add(node.id.name);
        },
        CallExpression(node) {
          const callee = node.callee;
          let call = null;
          // expo-router / a router instance: router.replace(...) / router.navigate(...)
          if (
            callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.object.type === "Identifier" &&
            callee.object.name === "router" &&
            callee.property.type === "Identifier" &&
            (callee.property.name === "replace" || callee.property.name === "navigate")
          )
            call = `router.${callee.property.name}`;
          // TanStack: navigate({ to }) where navigate = useNavigate()
          else if (callee.type === "Identifier" && navigators.has(callee.name)) call = `${callee.name}(...)`;
          // Flag only inside an effect. A user-action push/back/replace is a completion, not a render loop.
          if (call && inEffect(node)) context.report({ node, messageId: "effectReplace", data: { call } });
        },
      };
    },
  },

  // SKYFE016 — the session is written through ONE seam (lib/session). The bug: token writes scattered across
  // viewModels (login, signup, impersonate), each of which must REMEMBER to reset the `me` cache — and the one that
  // forgets bounces the just-authenticated user back to login (a stale anonymous `me` error survives the sign-in).
  // Centralizing the write in the seam pairs token + cache-reset by construction. Same "one door" shape as SKYFE002:
  // only the seam may import the token setter; everywhere else goes through the seam's signIn/signOut.
  "session-one-door": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Write the session token through one seam (lib/session) — a scattered token write that forgets to reset the session cache bounces the just-authenticated user back to login.",
      },
      messages: {
        offdoor:
          "SKYFE016: write the session only through the seam — import the token setter (`{{name}}`) into `lib/session` and expose signIn/signOut, not here. A scattered token write that forgets to reset the `me` query bounces the just-authenticated user back to login.",
        storage:
          "SKYFE016: don't write the token to storage here (`{{call}}(\"{{key}}\", …)`) — that is a session write outside the seam, and it skips the `me`-cache reset the seam pairs with it. Call the seam's signIn/signOut instead; only `lib/session` touches token storage.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isInfraDataDoor(f) || isTest(f)) return {}; // the seam (lib/session) legitimately writes; tests seed freely
      // A storage write keyed by a token-ish name is the same scattered session write as importing the setter —
      // the name-pattern door closes, the localStorage/AsyncStorage/SecureStore door must close with it.
      const TOKEN_KEY = /token|session|jwt|auth/i;
      const STORAGE = /^(localStorage|sessionStorage|AsyncStorage|SecureStore)$/;
      return {
        ImportDeclaration(node) {
          for (const s of node.specifiers) {
            if (s.type === "ImportSpecifier" && /^set(Access)?(Token|Session)$/.test(s.imported.name))
              context.report({ node: s, messageId: "offdoor", data: { name: s.imported.name } });
          }
        },
        CallExpression(node) {
          const callee = node.callee;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier" || !/^set(Item|ItemAsync)$/.test(callee.property.name)) return;
          const obj = callee.object;
          const root =
            obj.type === "Identifier"
              ? obj.name
              : obj.type === "MemberExpression" && obj.property.type === "Identifier"
                ? obj.property.name // window.localStorage
                : null;
          if (!root || !STORAGE.test(root)) return;
          const key = node.arguments[0];
          if (key && key.type === "Literal" && typeof key.value === "string" && TOKEN_KEY.test(key.value))
            context.report({
              node,
              messageId: "storage",
              data: { call: `${root}.${callee.property.name}`, key: key.value },
            });
        },
      };
    },
  },

  // SKYFE017 — a route guard branches its redirect on a tri-state SessionState, NEVER a raw `isAuthenticated`
  // boolean. The boolean has no "still loading" — it is false while the session is in flight, so the guard fires its
  // redirect before the answer settles (the canonical bounce-to-login). Branch on `session.status` instead, where
  // `loading` is a distinct case you must handle. The read-side twin of SKYFE010 (a View routes state through the
  // spine's union, not raw `isPending`). Scoped to route/guard files — where redirects live.
  "guard-tristate": {
    meta: {
      type: "problem",
      docs: {
        description:
          "A guard redirects on a tri-state SessionState (loading | authenticated | anonymous), not a raw isAuthenticated boolean (which reads 'still loading' as 'signed out' and bounces a not-yet-settled user to login).",
      },
      messages: {
        boolRedirect:
          "SKYFE017: don't redirect on a raw `{{name}}` boolean — it reads 'still loading' as 'signed out', bouncing a not-yet-settled user to login. Branch on a tri-state session: handle `loading` (defer), then `if (session.status === 'anonymous') return <Navigate…/>` (use the spine's SessionState).",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isRoute(f) && !isInfraDataDoor(f)) return {};
      return {
        IfStatement(node) {
          // `if (!<authBool>) return <Redirect/Navigate …/>` — the boolean-collapse redirect.
          if (node.test.type !== "UnaryExpression" || node.test.operator !== "!") return;
          const name = authBoolName(node.test.argument);
          if (name && returnsRedirect(node.consequent))
            context.report({ node: node.test, messageId: "boolRedirect", data: { name } });
        },
      };
    },
  },

  // SKYFE018 — a route that reads a REQUIRED id param must guard its absence with a declarative redirect. Hitting the
  // route param-less (a bookmark, a stale/mis-wired link) otherwise renders a "ghost" screen bound to an empty id —
  // the pilot's empty "Propriedade" thread. The fix is `if (!id) return <Redirect href={…} />` before the View. Scoped
  // to expo-router's `useLocalSearchParams` (the one router where a path/search param can be absent at render; on
  // TanStack a matched route guarantees its path param) and to id-shaped names (optional filter params don't ghost).
  "route-param-guard": {
    meta: {
      type: "problem",
      docs: {
        description:
          "A route reading a required id param (useLocalSearchParams) must guard its absence with a declarative redirect — a param-less hit otherwise renders a ghost screen on an empty id.",
      },
      messages: {
        unguarded:
          "SKYFE018: the route reads `{{name}}` from useLocalSearchParams but never guards its absence — a param-less hit (bookmark / stale link) renders a ghost screen on an empty id. Add `if (!{{name}}) return <Redirect href={…} />;` before rendering the View.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isRoute(f)) return {};
      return {
        VariableDeclarator(node) {
          if (!node.init || node.init.type !== "CallExpression") return;
          if (node.init.callee.type !== "Identifier" || node.init.callee.name !== "useLocalSearchParams") return;
          if (node.id.type !== "ObjectPattern") return;
          const fn = enclosingFunction(node);
          if (!fn) return;
          for (const prop of node.id.properties) {
            if (prop.type !== "Property" || prop.key.type !== "Identifier" || !ID_PARAM.test(prop.key.name)) continue;
            const local = prop.value.type === "Identifier" ? prop.value.name : prop.key.name;
            if (!hasPresenceGuard(fn, aliasesOf(fn, local)))
              context.report({ node: prop, messageId: "unguarded", data: { name: local } });
          }
        },
      };
    },
  },

  // SKYFE019 — no bare `router.back()` / `history.back()`. On web a deep-linked / refreshed screen has no in-app
  // history, so back() is a no-op and the "Back" button is dead (the pilot migrated ~13 screens off it). Route every
  // Back affordance through a guarded helper — the spine's `safeBack(router, fallback)` / an app `useGoBack` — that
  // pops when it can and otherwise replaces to a parent. A file that already guards with `canGoBack` is fine; the
  // nav seam (where the helper lives) is exempt. Scoped to the screens/routes that hold Back buttons.
  "safe-back": {
    meta: {
      type: "problem",
      docs: {
        description:
          "No bare router.back() — on web a deep-linked screen has no in-app history, so it is a no-op (a dead Back button). Use a guarded helper (safeBack / useGoBack) that falls back to a parent.",
      },
      messages: {
        bareBack:
          "SKYFE019: no bare `{{call}}` — on web a deep-linked / refreshed screen has no in-app history, so it does nothing (a dead 'Back' button). Use a guarded helper: `useGoBack(fallback)` / `safeBack(router, fallback)` (pops when it can, else replaces to a parent).",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if ((!isView(f) && !isRoute(f)) || isNavSeam(f)) return {};
      // An inline `canGoBack`-guarded back() is the safe shape — exempt files that already do it.
      if (/canGoBack/.test((context.sourceCode ?? context.getSourceCode()).getText())) return {};
      return {
        CallExpression(node) {
          const callee = node.callee;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier" || callee.property.name !== "back") return;
          const obj = callee.object;
          const isRouterBack = obj.type === "Identifier" && obj.name === "router";
          const isHistoryBack =
            obj.type === "MemberExpression" && obj.property.type === "Identifier" && obj.property.name === "history";
          if (!isRouterBack && !isHistoryBack) return;
          context.report({ node, messageId: "bareBack", data: { call: isRouterBack ? "router.back()" : "history.back()" } });
        },
      };
    },
  },

  // SKYFE020 — the API base URL comes from CONFIGURATION, never a hardcoded host baked into the client's construction
  // (`axios.create({ baseURL: "http://localhost:8080" })`). A baked literal can't follow dev/prod or a different
  // port, so it silently 404s when the backend runs elsewhere — the pilot's "front says :8080, API runs on :5000"
  // bug (the registered user bounced to login because `me` 404'd). Read it from env (`import.meta.env.VITE_API_URL`
  // / `process.env.EXPO_PUBLIC_API_URL`) with a relative or env fallback; the backend pins its dev port in
  // launchSettings so the two agree by construction. An env-fallback (`env.X ?? "…"`), a relative base (`""`/`/api`),
  // and an injectable default (`client.defaults.baseURL = …`, overridden at boot by configureClient) all pass.
  "no-hardcoded-base-url": {
    meta: {
      type: "problem",
      docs: {
        description:
          "The API base URL comes from configuration (env / a relative base / an injected default), not a hardcoded host baked into the client's construction — so dev/prod/ports don't drift and silently 404.",
      },
      messages: {
        hardcoded:
          "SKYFE020: don't hardcode the API base URL (`{{url}}`) in the client's construction — it can't follow dev/prod or a different port and silently 404s when the backend runs elsewhere. Read it from env (`import.meta.env.VITE_API_URL` / `process.env.EXPO_PUBLIC_API_URL`) with a relative or env fallback; the backend pins its dev port in launchSettings.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f)) return {};
      return {
        Property(node) {
          if (node.computed) return;
          const key = node.key;
          const name = key.type === "Identifier" ? key.name : key.type === "Literal" ? key.value : null;
          if (name !== "baseURL" && name !== "baseUrl") return;
          // Only a BARE absolute-URL literal is the bug. An env-fallback (`env.X ?? "…"`, a LogicalExpression) or a
          // relative base ("" / "/api") is configuration, not a baked host.
          const v = node.value;
          if (v.type === "Literal" && typeof v.value === "string" && /^https?:\/\//.test(v.value))
            context.report({ node: v, messageId: "hardcoded", data: { url: v.value } });
        },
      };
    },
  },

  // SKYFE021 — no dangerouslySetInnerHTML outside one audited seam. React's JSX escapes text by construction;
  // dangerouslySetInnerHTML is the single opt-out, and server/user-influenced HTML through it is XSS. If the app
  // truly renders rich HTML (a CMS body), that rendering lives in ONE seam (lib/html) where the sanitizer is
  // wired and reviewable — the same one-door shape as SKYFE002/SKYFE016. Everywhere else the prop is flagged.
  "no-raw-html": {
    meta: {
      type: "problem",
      docs: {
        description:
          "No dangerouslySetInnerHTML outside the lib/html seam — JSX escapes by construction; raw HTML is the XSS door and belongs behind one audited, sanitizing seam.",
      },
      messages: {
        rawHtml:
          "SKYFE021: no dangerouslySetInnerHTML here — JSX already escapes; raw HTML is the XSS door. If the app renders rich HTML, do it in ONE seam (lib/html) with the sanitizer wired, and use that component.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f) || /(^|\/)lib\/html(\.|\/)/.test(f)) return {};
      return {
        JSXAttribute(node) {
          if (node.name.type === "JSXIdentifier" && node.name.name === "dangerouslySetInnerHTML")
            context.report({ node, messageId: "rawHtml" });
        },
      };
    },
  },

  // SKYFE022 — never navigate to a value that arrived in the URL. `router.replace(returnTo)` /
  // `window.location.href = next` where the target derives from a route/search param is an open redirect: a
  // crafted link sends the user (and their session-carrying browser) anywhere the attacker chose — the phishing
  // primitive. The fix is an allowlist: map the param to a KNOWN in-app route (`const to = routes[returnTo] ??
  // "/home"`) and navigate to the mapped value, never the raw param. The rule tracks the identifiers bound from
  // useLocalSearchParams / useSearchParams / useSearch and flags any navigation whose argument references one.
  "no-open-redirect": {
    meta: {
      type: "problem",
      docs: {
        description:
          "No navigation to a raw route/search param (open redirect) — map the param through an allowlist of known in-app routes first.",
      },
      messages: {
        openRedirect:
          "SKYFE022: `{{call}}` navigates to a value that arrived in the URL (`{{name}}`) — an open redirect: a crafted link sends the user anywhere. Map it through an allowlist of known routes (`routes[{{name}}] ?? \"/home\"`) and navigate to the mapped value.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isView(f) && !isRoute(f)) return {};
      // Names that carry URL-supplied values: the params object itself and the names destructured from it.
      const tainted = new Set();
      const PARAM_HOOKS = /^(useLocalSearchParams|useSearchParams|useSearch|useGlobalSearchParams)$/;
      const taintedIn = (expr) => {
        let hit = null;
        walk(expr, (n) => {
          if (n.type === "Identifier" && tainted.has(n.name)) {
            hit = n.name;
            return true;
          }
          return false;
        });
        return hit;
      };
      const report = (node, call, name) =>
        context.report({ node, messageId: "openRedirect", data: { call, name } });
      return {
        VariableDeclarator(node) {
          if (!node.init || node.init.type !== "CallExpression") return;
          if (node.init.callee.type !== "Identifier" || !PARAM_HOOKS.test(node.init.callee.name)) return;
          if (node.id.type === "Identifier") tainted.add(node.id.name);
          if (node.id.type === "ObjectPattern")
            for (const p of node.id.properties)
              if (p.type === "Property" && p.value.type === "Identifier") tainted.add(p.value.name);
          if (node.id.type === "ArrayPattern" && node.id.elements[0]?.type === "Identifier")
            tainted.add(node.id.elements[0].name); // useSearchParams() → [params]
        },
        CallExpression(node) {
          const callee = node.callee;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier") return;
          const method = callee.property.name;
          const isRouterNav =
            callee.object.type === "Identifier" &&
            callee.object.name === "router" &&
            /^(replace|push|navigate)$/.test(method);
          const isLocationNav =
            /^(assign|replace)$/.test(method) &&
            ((callee.object.type === "Identifier" && callee.object.name === "location") ||
              (callee.object.type === "MemberExpression" &&
                callee.object.property.type === "Identifier" &&
                callee.object.property.name === "location"));
          if (!isRouterNav && !isLocationNav) return;
          for (const arg of node.arguments) {
            const name = taintedIn(arg);
            if (name) return report(node, `${isRouterNav ? "router" : "location"}.${method}(…)`, name);
          }
        },
        AssignmentExpression(node) {
          // window.location.href = <param> / location.href = <param>
          const left = node.left;
          if (
            left.type === "MemberExpression" &&
            left.property.type === "Identifier" &&
            left.property.name === "href"
          ) {
            const name = taintedIn(node.right);
            if (name) report(node, "location.href = …", name);
          }
        },
      };
    },
  },

  // SKYFE024 — the ui-door: a View renders no host element and carries no style/className. The SKYFE002 one-door
  // pattern applied to paint: everything visual reaches a screen through the app's `@/ui` kit, whose props are
  // token unions — so a `<div>` or a free-form class in a View is a visual decision escaping the design system.
  // The sample's pre-kit ui.tsx leaked exactly this (a className passthrough) and one hatch reopened every
  // decision. The kit itself (ui/) is the door's inside — out of scope; so are tests.
  "ui-door": {
    meta: {
      type: "problem",
      docs: {
        description: "A View renders no host element and no style/className — everything visual comes from @/ui.",
      },
      messages: {
        host: "SKYFE024: a View renders no host element (`<{{tag}}>`) — compose `@/ui` primitives; if one is missing, extend the kit (ui/ is yours), never inline the paint.",
        attr: "SKYFE024: no `{{attr}}` in a View — visual decisions live in `@/ui` props (token unions), not free-form styling.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isView(f) || isTest(f)) return {};
      return {
        JSXOpeningElement(node) {
          if (node.name.type === "JSXIdentifier" && /^[a-z]/.test(node.name.name)) {
            context.report({ node, messageId: "host", data: { tag: node.name.name } });
          }
        },
        JSXAttribute(node) {
          if (node.name.type === "JSXIdentifier" && (node.name.name === "style" || node.name.name === "className")) {
            context.report({ node, messageId: "attr", data: { attr: node.name.name } });
          }
        },
      };
    },
  },

  // SKYFE025 — spacing/typography only from the scale. An off-scale literal (`padding: 13`, `p-[13px]`) is how
  // rhythm dies one screen at a time: the eighth spacing step is a design decision, not a pixel. Scoped to style
  // contexts (a JSX `style` bag, `StyleSheet.create`) and Tailwind arbitrary values in `className`; the kit (ui/)
  // and the token files are the two places that legitimately speak pixels.
  "scale-only": {
    meta: {
      type: "problem",
      docs: {
        description: "No off-scale spacing/typography literals outside ui/ and the token files — values come from the space/text tokens.",
      },
      messages: {
        offscale:
          "SKYFE025: `{{key}}: {{value}}` is off-scale — spacing/typography come from the tokens (`space`/`text` in design/tokens.ts), reached through `@/ui` props.",
        arbitrary:
          "SKYFE025: Tailwind arbitrary value in `{{value}}` — spacing/typography come from the token scale mapped into the Tailwind theme, never `[Npx]`.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f) || isUiKit(f) || TOKEN_FILES.test(f) || !/\.(ts|tsx)$/.test(f)) return {};
      const SPACING_KEYS = /^((padding|margin)([A-Z][a-zA-Z]*)?|gap|rowGap|columnGap|borderRadius|fontSize|lineHeight)$/;
      const PX_STRING = /^\d+(\.\d+)?(px|rem|em)$/;
      // The Tailwind half mirrors the style-object half EXACTLY: an arbitrary value is off-scale only when it
      // rides a SPACING/TYPOGRAPHY utility (p-/m-/gap-/space-/text-/leading-/rounded-). Layout dimensions
      // (`max-w-[560px]`, `h-[80vh]`) are none of this rule's business — the style half deliberately allows
      // `width: 320`, and flagging the class spelling of the same decision was an asymmetry a pilot dogfood
      // caught (the hostpoint-os modals).
      const ARBITRARY =
        /(^|[\s:"'`])-?(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap(-[xy])?|space-[xy]|text|leading|rounded(-(ss|se|es|ee|t|r|b|l|tl|tr|br|bl))?)-\[\d+(\.\d+)?(px|rem|em|%)\]/;

      // A Property is a style declaration when its nearest JSX attribute is `style` or its nearest call is
      // `StyleSheet.create` — plain data objects (a config, a payload) are none of lint's business.
      function inStyleContext(node) {
        for (let p = node.parent; p; p = p.parent) {
          if (p.type === "JSXAttribute") return p.name.type === "JSXIdentifier" && p.name.name === "style";
          if (p.type === "CallExpression")
            return (
              p.callee.type === "MemberExpression" &&
              !p.callee.computed &&
              p.callee.object.type === "Identifier" &&
              p.callee.object.name === "StyleSheet" &&
              p.callee.property.type === "Identifier" &&
              p.callee.property.name === "create"
            );
        }
        return false;
      }

      return {
        Property(node) {
          if (node.computed) return;
          const key =
            node.key.type === "Identifier" ? node.key.name : node.key.type === "Literal" ? String(node.key.value) : "";
          if (!SPACING_KEYS.test(key)) return;
          const v = node.value;
          const offScaleNumber = v.type === "Literal" && typeof v.value === "number" && v.value !== 0;
          const offScalePx = v.type === "Literal" && typeof v.value === "string" && PX_STRING.test(v.value);
          if ((offScaleNumber || offScalePx) && inStyleContext(node)) {
            context.report({ node, messageId: "offscale", data: { key, value: String(v.value) } });
          }
        },
        JSXAttribute(node) {
          if (node.name.type !== "JSXIdentifier" || node.name.name !== "className" || !node.value) return;
          if (node.value.type === "Literal" && typeof node.value.value === "string" && ARBITRARY.test(node.value.value)) {
            context.report({ node, messageId: "arbitrary", data: { value: node.value.value } });
            return;
          }
          if (node.value.type === "JSXExpressionContainer" && node.value.expression.type === "TemplateLiteral") {
            for (const q of node.value.expression.quasis) {
              if (ARBITRARY.test(q.value.raw)) {
                context.report({ node, messageId: "arbitrary", data: { value: q.value.raw } });
                return;
              }
            }
          }
        },
      };
    },
  },

  // SKYFE026 — color is a semantic role, or it does not ship. SKYFE012 catches the hex spelling; this closes the
  // rest of the leak: rgb()/hsl()/oklch() literals, CSS named colors in color-ish style keys, and a value-import
  // of the raw palette outside the kit. A raw color in a screen forks the palette and defeats theming silently —
  // hex was only one spelling of it.
  "semantic-colors": {
    meta: {
      type: "problem",
      docs: {
        description: "No raw color outside the token files — rgb()/hsl()/named colors and the raw palette stay behind the color.* roles.",
      },
      messages: {
        fn: "SKYFE026: raw color (`{{value}}`) — color is a semantic role (`color.*` in design/tokens.ts); raw values live only in the token file. (Hex is SKYFE012's half of this pair.)",
        named: "SKYFE026: named color (`{{value}}`) in `{{key}}` — use a semantic role (`color.*`), not a CSS color name.",
        palette: "SKYFE026: the raw palette is private to the token file — components touch `color.*` roles; only ui/ reaches deeper.",
        paletteClass:
          "SKYFE026: palette utility (`{{value}}`) — color is a semantic role; map the palette into a theme role and use `bg-primary`/`text-danger`/`border-muted`, never a raw `bg-red-500` outside ui/.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f) || TOKEN_FILES.test(f) || !/\.(ts|tsx)$/.test(f)) return {};
      const COLOR_FN = /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i;
      const NAMED =
        /^(red|blue|green|white|black|gray|grey|orange|purple|pink|yellow|teal|cyan|magenta|silver|maroon|navy|olive|lime|aqua|fuchsia)$/i;
      const COLOR_KEY = /(^color$|Color$)/;
      // The Tailwind half of the same leak: a palette-family color utility (bg-red-500, text-blue-600,
      // hover:border-rose-400/50) forks the palette in a className exactly as a raw rgb() forks it in a style
      // bag — and it is where the rot actually lives in a Tailwind web app. The band was blind to it (a pilot
      // baseline of 0 findings over 533 files while bg-red-100 was everywhere). A semantic, theme-mapped
      // utility (bg-primary, text-danger) carries no palette family + numeric shade, so it never matches; ui/
      // is the one place that composes the primitives from the raw palette.
      const PALETTE_CLASS =
        /(?:^|[\s:"'`])((?:bg|text|border|ring(?:-offset)?|fill|stroke|from|via|to|divide|outline|decoration|caret|accent|placeholder|shadow)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/\d{1,3})?)\b/;
      const paletteIn = (s) => {
        const m = PALETTE_CLASS.exec(s);
        return m ? m[1] : null;
      };
      return {
        JSXAttribute(node) {
          if (isUiKit(f)) return; // the kit composes its primitives from the raw palette
          if (node.name.type !== "JSXIdentifier" || node.name.name !== "className" || !node.value) return;
          if (node.value.type === "Literal" && typeof node.value.value === "string") {
            const hit = paletteIn(node.value.value);
            if (hit) context.report({ node, messageId: "paletteClass", data: { value: hit } });
            return;
          }
          if (node.value.type === "JSXExpressionContainer" && node.value.expression.type === "TemplateLiteral") {
            for (const q of node.value.expression.quasis) {
              const hit = paletteIn(q.value.raw);
              if (hit) {
                context.report({ node, messageId: "paletteClass", data: { value: hit } });
                return;
              }
            }
          }
        },
        Literal(node) {
          if (typeof node.value !== "string") return;
          const value = node.value.trim();
          if (COLOR_FN.test(value)) {
            context.report({ node, messageId: "fn", data: { value } });
            return;
          }
          // A named color only counts inside a color-ish style key — the word "red" in copy is not a color.
          if (NAMED.test(value)) {
            const p = node.parent;
            if (p && p.type === "Property" && !p.computed && p.value === node && p.key.type === "Identifier" && COLOR_KEY.test(p.key.name)) {
              context.report({ node, messageId: "named", data: { value, key: p.key.name } });
            }
          }
        },
        ImportDeclaration(node) {
          if (isUiKit(f) || isTypeOnly(node)) return;
          if (!TOKEN_FILES.test(node.source.value)) return;
          for (const s of node.specifiers) {
            if (s.type === "ImportSpecifier" && s.importKind !== "type" && s.imported.name === "palette") {
              context.report({ node: s, messageId: "palette" });
            }
          }
        },
      };
    },
  },

  // SKYFE027 — a QueryClient carries the app's mutation defaults. The write-side of the state discipline: a bare
  // `new QueryClient()` leaves every mutation to hand-roll its own cache invalidation and its own error surface —
  // and the screen that forgets ships the pilot bug ("created a category, it only appeared after F5, with no
  // toast"; 13 of 43 ViewModels had no invalidation at all). The convention pins ONE construction shape:
  // `mutationCache: new MutationCache({ onSuccess, onError })` — success marks every query stale (active ones
  // refetch immediately; the safe, slightly-wasteful default that is always correct) and posts the success note;
  // failure routes through the feedback seam (the global half of SKYFE013). Scaffolded by tools/client-scaffold.mjs
  // as lib/query.ts. Tests and the shared test harness (a test/ or test-utils/ path) construct bare clients freely
  // — isolation is their job, defaults are the app's.
  "query-client-defaults": {
    meta: {
      type: "problem",
      docs: {
        description:
          "A QueryClient is constructed with the mutation defaults wired — mutationCache: new MutationCache({ onSuccess: <invalidate + success note>, onError: <feedback> }) — so every mutation invalidates stale reads and surfaces its outcome by default.",
      },
      messages: {
        missing:
          "SKYFE027: this QueryClient carries no mutation defaults — every mutation is left to hand-roll invalidation and error feedback, and the screen that forgets ships stale lists (the F5-to-see-your-write bug) and silent failures. Construct it with `mutationCache: new MutationCache({ onSuccess: <invalidateQueries + success note>, onError: <feedback seam> })` — scaffold lib/query.ts (tools/client-scaffold.mjs).",
        incomplete:
          "SKYFE027: the MutationCache defaults are missing `{{missing}}` — `onSuccess` invalidates every active query (no list is one F5 behind its server) and `onError` routes the failure through the feedback seam (no silent failure). Wire both.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      // The shared test harness lives outside *.test.* (e.g. src/test/providers.tsx) but builds throwaway
      // clients for isolation — the defaults are deliberately absent there.
      if (isTest(f) || /(^|\/)(test|tests|test-utils|testing|__tests__)(\/|\.)/.test(f)) return {};
      const prop = (obj, name) =>
        obj.properties.find(
          (p) =>
            p.type === "Property" &&
            !p.computed &&
            ((p.key.type === "Identifier" && p.key.name === name) || (p.key.type === "Literal" && p.key.value === name)),
        );
      const hasSpread = (obj) => obj.properties.some((p) => p.type === "SpreadElement");
      // `const cache = new MutationCache({...})` declared before the QueryClient — the indirection is still
      // checkable; anything built further away (imported, computed) is trusted as visible-in-review.
      const caches = new Map();
      const checkCacheOptions = (reportNode, optsNode) => {
        if (optsNode && optsNode.type !== "ObjectExpression") return; // built elsewhere — review's job
        const obj = optsNode ?? { properties: [] };
        if (hasSpread(obj)) return; // a spread may carry the handlers
        const missing = ["onSuccess", "onError"].filter((k) => !prop(obj, k));
        if (missing.length)
          context.report({ node: reportNode, messageId: "incomplete", data: { missing: missing.join("` and `") } });
      };
      return {
        VariableDeclarator(node) {
          if (
            node.id.type === "Identifier" &&
            node.init &&
            node.init.type === "NewExpression" &&
            node.init.callee.type === "Identifier" &&
            node.init.callee.name === "MutationCache"
          )
            caches.set(node.id.name, node.init.arguments[0] ?? null);
        },
        NewExpression(node) {
          if (node.callee.type !== "Identifier" || node.callee.name !== "QueryClient") return;
          const arg = node.arguments[0];
          if (!arg) return context.report({ node, messageId: "missing" });
          if (arg.type !== "ObjectExpression") return; // an options factory — trusted, visible in review
          const cacheProp = prop(arg, "mutationCache");
          if (!cacheProp) {
            if (!hasSpread(arg)) context.report({ node, messageId: "missing" });
            return;
          }
          const v = cacheProp.value;
          if (v.type === "NewExpression" && v.callee.type === "Identifier" && v.callee.name === "MutationCache")
            return checkCacheOptions(node, v.arguments[0] ?? null);
          if (v.type === "Identifier" && caches.has(v.name)) return checkCacheOptions(node, caches.get(v.name));
          // an imported/composed cache — it exists; its wiring is review's job, not a false positive's.
        },
      };
    },
  },

  // SKYFE028 — no manual refetch ritual. With the SKYFE027 defaults wired, a successful mutation already invalidates
  // every active query — so an `onSuccess` whose entire body is refetch/invalidate calls is the convention's
  // pre-history surviving as cargo cult (the pilot hand-rolled it in 30 of 43 ViewModels; the 13 that forgot were
  // the bug). Deleting it is the point: less ceremony per mutation, one fewer thing the next screen can forget.
  // An `onSuccess` that does MORE than refetch (navigate, reset a form, hand off an id) is real behavior — never
  // flagged. Warn-tier: it reveals redundancy, it does not gate.
  "no-manual-refetch-ritual": {
    meta: {
      type: "problem",
      docs: {
        description:
          "No onSuccess whose body only refetches/invalidates — the SKYFE027 mutation defaults already invalidate every active query on success; keep handlers only when they do more.",
      },
      messages: {
        ritual:
          "SKYFE028: redundant manual refetch — the app's mutation defaults (SKYFE027, lib/query.ts) already invalidate every active query on mutation success. Delete this `onSuccess`; keep a handler only when it does more than refetch.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isViewModel(f)) return {};
      const REFETCHISH = /^(refetch|invalidateQueries|resetQueries|refetchQueries)$/;
      const decls = new Map(); // name -> initializer (declared anywhere in the file)
      const candidates = [];
      // `useCallback(fn, deps)` wraps the ritual without changing it — analyze the wrapped fn.
      const unwrapInit = (init) =>
        init && init.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "useCallback"
          ? (init.arguments[0] ?? null)
          : init;
      const unwrapExpr = (expr) => {
        let e = expr;
        for (;;) {
          if (e && e.type === "UnaryExpression" && e.operator === "void") e = e.argument;
          else if (e && e.type === "AwaitExpression") e = e.argument;
          else if (e && e.type === "ChainExpression") e = e.expression;
          else return e;
        }
      };
      // A "refetch-ish" expression: a call to *.refetch()/queryClient.invalidateQueries(...) (any receiver), or a
      // call to a local name that itself resolves to a pure-refetch function (`onSuccess: () => invalidateSteps()`).
      const isRefetchCall = (expr, seen) => {
        const e = unwrapExpr(expr);
        if (!e || e.type !== "CallExpression") return false;
        const callee = e.callee;
        if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier")
          return REFETCHISH.test(callee.property.name);
        if (callee.type === "Identifier") return isPureRefetchName(callee.name, seen);
        return false;
      };
      const isPureRefetchFn = (fn, seen) => {
        if (!fn || (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression")) return false;
        if (fn.body.type !== "BlockStatement") return isRefetchCall(fn.body, seen);
        if (fn.body.body.length === 0) return false;
        return fn.body.body.every((s) => s.type === "ExpressionStatement" && isRefetchCall(s.expression, seen));
      };
      const isPureRefetchName = (name, seen) => {
        if (seen.has(name)) return false; // cycle guard
        seen.add(name);
        return isPureRefetchFn(unwrapInit(decls.get(name)), seen);
      };
      return {
        VariableDeclarator(node) {
          if (node.id.type === "Identifier" && node.init) decls.set(node.id.name, node.init);
        },
        Property(node) {
          if (node.computed) return;
          const key =
            node.key.type === "Identifier" ? node.key.name : node.key.type === "Literal" ? node.key.value : null;
          if (key === "onSuccess") candidates.push(node);
        },
        // Resolved at exit so a ritual referenced before its declaration is still traced.
        "Program:exit"() {
          for (const node of candidates) {
            const pure =
              node.value.type === "Identifier"
                ? isPureRefetchName(node.value.name, new Set())
                : isPureRefetchFn(unwrapInit(node.value), new Set());
            if (pure) context.report({ node, messageId: "ritual" });
          }
        },
      };
    },
  },

  // SKYFE029 — refresh-one-door. The session-rotation credential (the httpOnly cookie on web, the stored
  // refresh token on native) is BURNED by parallel rotation: the backend's theft detection sees a spent token
  // replayed and revokes the whole session family. So the Refresh slice has exactly ONE consumer surface — the
  // session seam's single-flight bootstrapSession (lib/session), which the client seam's 401 interceptor calls
  // through the injected setTokenRefresher — and a screen/viewModel that imports the refresh hook/operation, or
  // hand-rolls a POST to a refresh route, is the second rotation path that one day runs in parallel with the
  // first. Born from a pilot near-miss: a refresh bootstrap added to the session seam raced the client's 401
  // interceptor merged the same week — two cold-load rotations, one burned family.
  "refresh-one-door": {
    meta: {
      type: "problem",
      docs: {
        description:
          "The session refresh is rotated through one seam only (the client's single-flight interceptor or the session seam's gated bootstrap) — a second rotation path runs in parallel one day and trips the backend's refresh-theft detection.",
      },
      messages: {
        offdoor:
          "SKYFE029: don't consume the refresh operation (`{{name}}`) here — rotation has ONE door (the session seam's single-flight bootstrapSession, which the client's 401 interceptor calls via setTokenRefresher). A second rotation path eventually runs in parallel with the first, replays a spent token, and the backend's theft detection burns the whole session family.",
        raw:
          "SKYFE029: don't hand-roll a refresh call (`{{call}}`) here — rotation has ONE door (the session seam's single-flight bootstrapSession, which the client's 401 interceptor calls via setTokenRefresher). A parallel rotation replays a spent token and the backend's theft detection burns the whole session family.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      // The doors: the session/guards infra seams, the client seam itself, the generated client, and tests.
      const isClientSeam = /(^|\/)lib\/(skies-)?client(\.|\/)/.test(f);
      if (isInfraDataDoor(f) || isClientSeam || isGenerated(f) || isTest(f)) return {};
      const REFRESH_NAMES = /^(use)?refresh(accesstoken|token|session)?$/i;
      const REFRESH_SOURCE = new RegExp(`${GENERATED_OPERATIONS.source}|(^|/)lib/(skies-)?client`);
      return {
        ImportDeclaration(node) {
          if (isTypeOnly(node) || !REFRESH_SOURCE.test(node.source.value.replace(/\\/g, "/"))) return;
          for (const s of node.specifiers) {
            if (s.type === "ImportSpecifier" && s.importKind !== "type" && REFRESH_NAMES.test(s.imported.name))
              context.report({ node: s, messageId: "offdoor", data: { name: s.imported.name } });
          }
        },
        CallExpression(node) {
          const callee = node.callee;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier" || callee.property.name !== "post") return;
          const arg = node.arguments[0];
          if (arg && arg.type === "Literal" && typeof arg.value === "string" && /refresh/i.test(arg.value))
            context.report({ node, messageId: "raw", data: { call: `.post("${arg.value}")` } });
        },
      };
    },
  },

  // SKYFE030 — no `as never`/`as any`/`as unknown` on a navigation target. The cast exists for one reason: to
  // silence the router's typed routes — and with them silenced, a drifted route literal compiles clean and 404s
  // in prod (the pilot incident: server-minted route strings navigated via `router.push(x as never)`; two of the
  // routes didn't exist in the app). The fix is never the cast: with typed routes on (expo-router
  // `experiments.typedRoutes` / TanStack's generated route tree) a literal is compile-checked, and a dynamic path
  // takes the typed `{ pathname, params }` object shape. Router-agnostic like its routing siblings: recognizes
  // router.push/replace/navigate, a useNavigate() binding, and the declarative <Redirect href>/<Navigate to>/
  // <Link href|to>. The rule is only half the gate — its config pair is typed routes being ON; without that, a
  // removed cast merely degrades to `string`.
  "no-cast-navigation": {
    meta: {
      type: "problem",
      docs: {
        description:
          "No `as never`/`as any`/`as unknown` on a navigation target (imperative argument or declarative href/to) — the cast silences typed routes, and a silenced router lets a drifted route literal compile clean and 404 in prod.",
      },
      messages: {
        castNav:
          "SKYFE030: don't cast a navigation target (`as {{type}}` in `{{call}}`) — the cast silences typed routes, so a drifted/invalid route compiles clean and 404s in prod. Pass a typed route literal or the `{ pathname, params }` object (typed routes on: expo-router `experiments.typedRoutes` / TanStack's route tree); never a cast.",
        castHref:
          "SKYFE030: don't cast `{{attr}}` on <{{component}}> (`as {{type}}`) — the cast silences typed routes, so a drifted/invalid route compiles clean and 404s in prod. Pass a typed route literal or the `{ pathname, params }` object; never a cast.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f)) return {};
      const SILENCERS = { TSNeverKeyword: "never", TSAnyKeyword: "any", TSUnknownKeyword: "unknown" };
      // The cast may wrap the whole argument or sit anywhere inside it (`{ pathname: p as never }`,
      // `x as unknown as Href`) — walk the subtree and surface the first silencing cast.
      const findSilencingCast = (root) => {
        let hit = null;
        walk(root, (n) => {
          if ((n.type === "TSAsExpression" || n.type === "TSTypeAssertion") && SILENCERS[n.typeAnnotation.type]) {
            hit = { node: n, type: SILENCERS[n.typeAnnotation.type] };
            return true;
          }
          return false;
        });
        return hit;
      };
      // Identifiers bound from `useNavigate()` (TanStack) — so a bare `navigate(... as never)` is recognized.
      const navigators = new Set();
      const NAV_COMPONENTS = /^(Redirect|Navigate|Link)$/;
      return {
        VariableDeclarator(node) {
          if (
            node.id.type === "Identifier" &&
            node.init &&
            node.init.type === "CallExpression" &&
            node.init.callee.type === "Identifier" &&
            node.init.callee.name === "useNavigate"
          )
            navigators.add(node.id.name);
        },
        CallExpression(node) {
          const callee = node.callee;
          let call = null;
          if (
            callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.object.type === "Identifier" &&
            callee.object.name === "router" &&
            callee.property.type === "Identifier" &&
            /^(push|replace|navigate)$/.test(callee.property.name)
          )
            call = `router.${callee.property.name}(…)`;
          else if (callee.type === "Identifier" && navigators.has(callee.name)) call = `${callee.name}(…)`;
          if (!call) return;
          for (const arg of node.arguments) {
            const hit = findSilencingCast(arg);
            if (hit) return context.report({ node: hit.node, messageId: "castNav", data: { type: hit.type, call } });
          }
        },
        JSXAttribute(node) {
          if (node.name.type !== "JSXIdentifier" || !/^(href|to)$/.test(node.name.name)) return;
          const el = node.parent;
          if (el.type !== "JSXOpeningElement" || el.name.type !== "JSXIdentifier" || !NAV_COMPONENTS.test(el.name.name))
            return;
          if (!node.value || node.value.type !== "JSXExpressionContainer") return;
          const hit = findSilencingCast(node.value.expression);
          if (hit)
            context.report({
              node: hit.node,
              messageId: "castHref",
              data: { type: hit.type, attr: node.name.name, component: el.name.name },
            });
        },
      };
    },
  },

  // SKYFE031 — handleSubmit always carries its invalid path. RHF's `handleSubmit(onValid)` without the second
  // argument swallows a validation failure SILENTLY — and when the failing field sits off-screen (another
  // tab/step of a big editor), the submit button goes completely mute: no mutation, no toast, no visible error
  // (the pilot's "save isn't saving" prod bug — cep/lat/long failing on a hidden tab). SKYFE013/SKYFE027 surface a
  // FAILED MUTATION; this failure happens BEFORE the mutation, so it was the family's real hole. The blessed fix
  // is the spine's `submitOrReveal(form.handleSubmit, onValid, { onInvalid })` — it forces the surface and
  // resolves the first invalid field so the shell can navigate to it; a hand-passed `onInvalid` also passes.
  // Warn-tier on entry: a single-screen form whose inline field errors are all visible is a legitimate shape;
  // promote to error if the primitive absorbs the common case.
  "submit-handles-invalid": {
    meta: {
      type: "problem",
      docs: {
        description:
          "A ViewModel's handleSubmit(onValid) must also handle the invalid path — pass onInvalid or use the spine's submitOrReveal — so a validation failure (especially on an off-screen tab/step) is never a silent, mute submit button.",
      },
      messages: {
        silent:
          "SKYFE031: `handleSubmit` with only the valid path — a validation failure is swallowed silently, and with the failing field off-screen (another tab/step) the submit button goes mute: no mutation, no toast, nothing. Use the spine's `submitOrReveal(form.handleSubmit, onValid, { onInvalid })` (it forces the surface and resolves the first invalid field to navigate to), or pass the second argument: `handleSubmit(onValid, onInvalid)`.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isViewModel(f)) return {};
      return {
        CallExpression(node) {
          const callee = node.callee;
          const isBare = callee.type === "Identifier" && callee.name === "handleSubmit";
          const isMember =
            callee.type === "MemberExpression" &&
            !callee.computed &&
            callee.property.type === "Identifier" &&
            callee.property.name === "handleSubmit";
          if ((isBare || isMember) && node.arguments.length === 1)
            context.report({ node, messageId: "silent" });
        },
      };
    },
  },

  // SKYFE032 — a <Controller> render that never reads `fieldState` gives a validated error NO surface on its
  // field (the pilot's Description input: `render={({ field }) => …}` — its validation failure showed nowhere,
  // not inline, not as a toast). The sibling of SKYFE031: that one guarantees the FORM-level surface, this one the
  // FIELD-level one; together "a validation error always shows" holds by construction. Near-zero false positives:
  // passing `error={fieldState.error?.message}` on a field without validation is inert. A deliberately non-inline
  // surface must still expose the same error state explicitly. Warn-tier on entry, promoted alongside
  // SKYFE031. Only an inline render function is analyzed — a referenced render component is visible in review.
  "controller-field-state": {
    meta: {
      type: "problem",
      docs: {
        description:
          "A <Controller> render prop must read fieldState (destructured or accessed) and surface the field's error — a render that only takes `field` leaves a validation failure with no surface on that field.",
      },
      messages: {
        blind:
          "SKYFE032: this <Controller{{name}}> render never reads `fieldState` — a validation error on the field has NO surface (no inline error under the control). Read it and pass the error through: `render={({ field, fieldState }) => <… error={fieldState.error?.message} />}`.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (isTest(f)) return {};
      return {
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || node.name.name !== "Controller") return;
          let render = null;
          let name = "";
          for (const attr of node.attributes) {
            if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;
            if (attr.name.name === "render" && attr.value && attr.value.type === "JSXExpressionContainer")
              render = attr;
            if (attr.name.name === "name" && attr.value && attr.value.type === "Literal")
              name = ` name="${attr.value.value}"`;
          }
          if (!render) return;
          const fn = render.value.expression;
          if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") return;
          // Destructured (`{ field, fieldState }`) or accessed (`props.fieldState`) both count as reading —
          // one identifier walk over params + body covers every spelling.
          if (!identifierAppears(fn, "fieldState"))
            context.report({ node: render, messageId: "blind", data: { name } });
        },
      };
    },
  },

  // SKYFE033 — every `@verify` obligation has its `@avp` proof, and every proof belongs to an obligation. The
  // front-side of the backend's SKY0030 (the
  // manifest↔AVP bridge), and the closing leg of Skies Clockwork on the frontend: a View/ViewModel that
  // declares `@verify <criterion-id>` (the AVP acceptance obligation — the JSDoc twin of the backend
  // manifest criterion) must have a co-located `*.assay.test.tsx` carrying `@avp <criterion-id>` and registering a
  // `defineVerification(...)`: the assay JS verification that the behaviour actually holds, not just that it was
  // claimed. Markers are JSDoc tags, erased at runtime — doctor-removable like every SKYFE rule. Co-location binds
  // the proof to its subject: Foo.view.tsx / Foo.viewModel.ts is proven only by Foo.assay.test.tsx, never by a marker in
  // an ordinary component test or another feature's assay. (Whether the proof PASSES is the test runner's job —
  // Doctor 2; this rule, like SKY0030, enforces the pairing exists — Doctor 1.)
  "verify-has-avp-proof": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Every `@verify <id>` on a View/ViewModel has exactly one matching executable `@avp <id>` proof in its co-located *.assay.test.tsx.",
      },
      messages: {
        undeclared:
          "SKYFE033: this ViewModel declares no `@verify <criterion-id>` acceptance obligation — every feature needs at least one AVP criterion.",
        missing:
          "SKYFE033: `@verify {{id}}` declares an AVP obligation with no co-located proof — create {{test}} with an `@avp {{id}}` assay verification that proves the behaviour.",
        unproven:
          "SKYFE033: `@verify {{id}}` is declared but {{test}} carries no `@avp {{id}}` proof — add the assay JS verification tagged `@avp {{id}}` so the obligation is proven, not just claimed.",
        inert:
          "SKYFE033: {{test}} carries `@avp {{id}}` but registers no `defineVerification(...)` for that exact criterion — one Assay case cannot lend execution to unrelated markers.",
        orphan:
          "SKYFE033: {{test}} carries `@avp {{id}}` but its co-located View/ViewModel declares no matching `@verify {{id}}` obligation — declare the criterion on the subject so E2E coverage cannot ignore this proof.",
        noOracle:
          "SKYFE033: `productVerification(...)` has no executable assertion — an AVP callback must contain an `expect`/assert oracle (or the scaffold's deliberate throw), not merely run code and return green.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      const idsIn = (text, tag) => {
        const ids = new Set();
        const re = new RegExp(`@${tag}\\s+([\\w.-]+)`, "g");
        let m;
        while ((m = re.exec(text)) !== null) ids.add(m[1]);
        return ids;
      };
      const idsInComments = (text, tag) => {
        const ids = new Set();
        const comments = text.match(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm) ?? [];
        for (const comment of comments) for (const id of idsIn(comment, tag)) ids.add(id);
        return ids;
      };
      const isAssayProof = /\.assay\.test\.[cm]?[jt]sx?$/.test(f);
      if (isAssayProof) {
        const hasOracle = (callback) => {
          let found = false;
          walk(callback.body, (node) => {
            if (node.type === "ThrowStatement") {
              found = true;
              return true;
            }
            if (node.type !== "CallExpression") return false;
            const callee = node.callee;
            if (callee.type === "Identifier" && /^(?:expect|assert|assert[A-Z].*)$/.test(callee.name)) {
              found = true;
              return true;
            }
            if (callee.type === "Identifier" && /^get(?:All)?By[A-Z]/.test(callee.name)) {
              found = true;
              return true;
            }
            if (
              callee.type === "MemberExpression" &&
              callee.object.type === "Identifier" &&
              callee.object.name === "assert"
            ) {
              found = true;
              return true;
            }
            if (
              callee.type === "MemberExpression" &&
              !callee.computed &&
              callee.property.type === "Identifier" &&
              /^get(?:All)?By[A-Z]/.test(callee.property.name)
            ) {
              found = true;
              return true;
            }
            return false;
          });
          return found;
        };
        return {
          CallExpression(node) {
            if (node.callee.type !== "Identifier" || node.callee.name !== "productVerification") return;
            const callback = node.arguments[3];
            if (!callback || (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression")) {
              context.report({ node, messageId: "noOracle" });
              return;
            }
            if (!hasOracle(callback)) context.report({ node: callback, messageId: "noOracle" });
          },
          "Program:exit"(node) {
            const sourceCode = context.sourceCode ?? context.getSourceCode();
            const proofs = new Set();
            for (const comment of sourceCode.getAllComments()) {
              for (const id of idsIn(comment.value, "avp")) proofs.add(id);
            }
            if (proofs.size === 0) return;

            const base = path.basename(context.filename).replace(/\.assay\.test\.[cm]?[jt]sx?$/, "");
            const directory = path.dirname(context.filename);
            const obligations = new Set();
            for (const suffix of [".viewModel.ts", ".viewModel.tsx", ".view.ts", ".view.tsx"]) {
              const subjectPath = path.join(directory, `${base}${suffix}`);
              if (!fs.existsSync(subjectPath)) continue;
              const subjectText = fs.readFileSync(subjectPath, "utf8");
              for (const id of idsInComments(subjectText, "verify")) obligations.add(id);
            }
            for (const id of proofs) {
              if (obligations.has(id)) continue;
              context.report({
                node,
                messageId: "orphan",
                data: { id, test: path.basename(context.filename) },
              });
            }
          },
        };
      }
      if (!isView(f) && !isViewModel(f)) return {};
      // Markers are read from COMMENTS (JSDoc), never strings — so a literal "@verify" in copy never false-fires.
      return {
        "Program:exit"(node) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const obligations = new Set();
          for (const c of sourceCode.getAllComments()) for (const id of idsIn(c.value, "verify")) obligations.add(id);
          if (obligations.size === 0) {
            if (isViewModel(f)) context.report({ node, messageId: "undeclared" });
            return;
          }

          const base = path.basename(context.filename).replace(/\.(view\.tsx|viewModel\.ts)$/, "");
          const testPath = path.join(path.dirname(context.filename), `${base}.assay.test.tsx`);
          const testExists = fs.existsSync(testPath);
          // The proof side is read as TEXT (the file isn't parsed here) — the same plain scan the backend's
          // SKY0030 runs over its AdditionalFiles test files.
          const proofText = testExists ? fs.readFileSync(testPath, "utf8") : "";
          const proven = idsInComments(proofText, "avp");
          const executableSource = proofText.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
          const escapesRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

          for (const id of obligations) {
            if (!testExists) context.report({ node, messageId: "missing", data: { id, test: `${base}.assay.test.tsx` } });
            else if (!proven.has(id)) context.report({ node, messageId: "unproven", data: { id, test: `${base}.assay.test.tsx` } });
            else {
              const directRegistration = new RegExp(
                `\\bdefineVerification\\s*\\([\\s\\S]{0,1000}?["'\`]${escapesRegex(id)}["'\`]`,
              ).test(executableSource);
              const subjectDeclaration = new RegExp(
                `\/\\*[\\s\\S]*?@avp\\s+${escapesRegex(id)}\\b[\\s\\S]*?\\*\/`
                  + "(?:\\s|\/\/[^\\r\\n]*(?:\\r?\\n|$)|\/\\*[\\s\\S]*?\\*\/)*"
                  + "(?:export\\s+)?const\\s+([A-Za-z_$][\\w$]*)\\b",
              ).exec(proofText);
              const subjectRegistration = subjectDeclaration
                ? new RegExp(
                  `\\bdefineVerification\\s*\\([\\s\\S]{0,1000}?\\b${escapesRegex(subjectDeclaration[1])}\\b`,
                ).test(executableSource)
                : false;
              const executable = directRegistration || subjectRegistration;
              if (!executable) context.report({ node, messageId: "inert", data: { id, test: `${base}.assay.test.tsx` } });
            }
          }
        },
      };
    },
  },

  // SKYFE034 — omitted tests are not evidence. Unit/integration runners commonly exit zero when tests are skipped,
  // conditional, or excluded by a focused test, so the static doctor rejects those forms before the false green.
  "no-disabled-tests": {
    meta: {
      type: "problem",
      docs: { description: "Test/spec files contain no skipped, conditional, or focused test declarations." },
      messages: {
        disabled:
          "SKYFE034: `{{call}}` disables a required test — implement or repair it; a test that did not run is not proof.",
        focused:
          "SKYFE034: `{{call}}` focuses the runner on part of the suite — remove it so every required test executes.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f)) return {};
      return {
        CallExpression(node) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const call = sourceCode.getText(node.callee).replace(/\s/g, "");
          const root = (callee) => {
            if (callee.type === "Identifier") return callee.name;
            if (callee.type === "MemberExpression" && !callee.computed) return root(callee.object);
            if (callee.type === "CallExpression") return root(callee.callee);
            return null;
          };
          const finalProperty = node.callee.type === "MemberExpression" && !node.callee.computed
            && node.callee.property.type === "Identifier"
            ? node.callee.property.name
            : null;
          const disabled = /^(?:skip|fixme|todo|skipIf|runIf)$/.test(finalProperty ?? "")
            && /^(?:test|it|describe|context)$/.test(root(node.callee) ?? "");
          const focused = finalProperty === "only"
            && /^(?:test|it|describe|context)$/.test(root(node.callee) ?? "");
          if (/^x(?:it|test|describe|context)$/.test(call) || disabled)
            context.report({ node: node.callee, messageId: "disabled", data: { call } });
          else if (/^f(?:it|test|describe|context)$/.test(call) || focused)
            context.report({ node: node.callee, messageId: "focused", data: { call } });
        },
      };
    },
  },

  // SKYFE035 — every ViewModel is a user-visible feature boundary and therefore names at least two executable
  // journeys: happy and sad. Resolution, path polarity and exact subject binding are workspace-level and belong
  // to skyfe-feature-e2e; this local floor makes an incomplete feature red at authoring time.
  "feature-has-e2e-flow": {
    meta: {
      type: "problem",
      docs: { description: "Every ViewModel declares stable happy and sad `@e2e <flow-id>` obligations." },
      messages: {
        missing:
          "SKYFE035: this ViewModel declares no `@e2e <flow-id>` — link every visible feature to happy and sad executable journeys.",
        incomplete:
          "SKYFE035: this ViewModel declares only one `@e2e <flow-id>` — complete depth requires distinct happy and sad surface flows.",
      },
    },
    create(context) {
      const f = context.filename.replace(/\\/g, "/");
      if (!isViewModel(f)) return {};
      return {
        "Program:exit"(node) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const linked = new Set();
          for (const comment of sourceCode.getAllComments()) {
            for (const match of comment.value.matchAll(/@e2e\s+([a-z0-9][a-z0-9._-]*)\b/gi))
              linked.add(match[1]);
          }
          if (linked.size === 0) context.report({ node, messageId: "missing" });
          else if (linked.size === 1) context.report({ node, messageId: "incomplete" });
        },
      };
    },
  },
};

const plugin = {
  meta: { name: "eslint-plugin-skies", version },
  rules,
  configs: {},
};

plugin.configs["flat/recommended"] = {
  name: "skies/recommended",
  plugins: { skies: plugin },
  rules: Object.fromEntries(Object.keys(rules).map((rule) => [`skies/${rule}`, "warn"])),
};

module.exports = plugin;
