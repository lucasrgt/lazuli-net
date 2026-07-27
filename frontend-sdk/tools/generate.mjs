// Frontend generators — the parallel of the backend scaffold. Beyond the typed client (orval), these emit the
// *structure*: a feature unit (ViewModel + View + tests + AVP assay + i18n) from a name, and the assembled i18n resource tree
// from every feature's catalog. Pure render functions (testable, no I/O); the *.mjs CLIs wrap them with file
// writes, and the `skies` .NET CLI front-door shells out to those CLIs (the way `skies doctor` shells out to
// `npm run lint`). The unit they emit is the blessed sample/items with names substituted — conformant by
// construction (it passes the SKYFE rules + typecheck + its own test, because the sample does).

/** "user-profile" / "userProfiles" -> "UserProfiles" */
export function pascal(s) {
  return String(s)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** "Bookings" -> "bookings" */
export function camel(s) {
  const p = pascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** Naive singularize for the entity type — scaffold convenience, the author refines. bookings->booking, ies->y. */
export function singular(s) {
  const w = String(s);
  if (/ies$/i.test(w)) return w.replace(/ies$/i, "y");
  if (/s$/i.test(w) && !/ss$/i.test(w)) return w.replace(/s$/i, "");
  return w;
}

/** A JS-identifier-safe token for a namespace ("user-profile" -> "user_profile"). */
export function ident(ns) {
  return String(ns).replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Render a feature unit from a plural feature name (e.g. "bookings"). Returns { filename: contents } for the five
 * co-located files — the canonical unit. Names are derived: ns "bookings", component "Bookings", collection
 * "bookings", entity "Booking", model hook "useBookingsModel", list hook "useListBookings".
 */
export function renderFeature(nameRaw, criteria) {
  if (!Array.isArray(criteria) || criteria.length < 2) {
    throw new TypeError("renderFeature() requires at least two explicit semantic criteria (happy and sad outcomes).");
  }
  if (criteria.some((id) => typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(id))
      || new Set(criteria).size !== criteria.length) {
    throw new TypeError("renderFeature() criteria must be distinct stable lowercase ids.");
  }
  const Plural = pascal(nameRaw); // "Bookings"
  const collection = camel(Plural); // "bookings"
  const Entity = pascal(singular(camel(nameRaw))); // "Booking"
  const lower = collection.toLowerCase(); // i18n namespace + client.gen segment

  const verificationMarkers = criteria.map((id) => ` * @verify ${id}`).join("\n");
  const assayProofs = criteria.map((id) => `/** @avp ${id} */
defineVerification(...productVerification(
  "${Plural}",
  "${id}",
  "${id.replaceAll("-", " ")}",
  async () => {
    throw new Error("implement the ${id} product proof against the real ${Plural} ViewModel/View");
  },
));`).join("\n\n");

  const viewModel = `import { toAsyncState, type AsyncState } from "skies-react";
// The orval-generated typed hook for the \`list_${lower}\` slice — the ONLY data the door touches.
import { useList${Plural} } from "@/client.gen/${lower}";
import i18n from "@/i18n";

// FEATURE UNIT — the ViewModel (the "data door", the front-side of a backend [Slice]). Only place that touches the
// generated client (SKYFE002), platform-agnostic so it tests in jsdom (SKYFE009), exposes its resource as
// AsyncState<T> (the spine) so the View handles every state by construction.

export interface ${Entity} {
  id: string;
  name: string;
}

export interface ${Plural}Model {
  state: { ${collection}: AsyncState<${Entity}[]> };
}

/**
${verificationMarkers}
 * @e2e ${lower}-happy
 * @e2e ${lower}-sad
 */
export function use${Plural}Model(): ${Plural}Model {
  const query = useList${Plural}();

  const ${collection} = toAsyncState<${Entity}[]>(
    {
      isPending: query.isPending,
      isError: query.isError,
      data: query.data?.${collection},
      refetch: query.refetch,
    },
    { errorMessage: i18n.t("${lower}:error"), isEmpty: (list) => list.length === 0 },
  );

  return { state: { ${collection} } };
}
`;

  const view = `import { useTranslation } from "react-i18next";
import { Resource } from "skies-react";
// The design system — the View reaches it through these names only (never react-native directly).
import { Screen, Stack, Text, EmptyState } from "@/ui";
import { use${Plural}Model } from "./${Plural}.viewModel";
import type { ${Entity} } from "./${Plural}.viewModel";

// VIEW — render only (SKYFE001). Consumes the resource through <Resource>, so loading / error / empty are handled by
// construction and the body only ever runs with resolved data. No isPending/isError here (SKYFE010).
export function ${Plural}View() {
  const { t } = useTranslation("${lower}");
  const { state } = use${Plural}Model();

  return (
    <Resource
      state={state.${collection}}
      empty={
        <Screen>
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        </Screen>
      }
    >
      {(${collection}) => <${Plural}List ${collection}={${collection}} />}
    </Resource>
  );
}

function ${Plural}List({ ${collection} }: { ${collection}: ${Entity}[] }) {
  return (
    <Screen>
      <Stack>
        {${collection}.map((item) => (
          <Text key={item.id}>{item.name}</Text>
        ))}
      </Stack>
    </Screen>
  );
}
`;

  const test = `import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { use${Plural}Model } from "./${Plural}.viewModel";
import { ${Plural}View } from "./${Plural}.view";

// CANONICAL TESTS — the two co-located tiers the harness enforces:
//  - SKYFE005 (unit): renderHook the ViewModel (the data door) against the real client — wired, not mocked.
//  - SKYFE006 (integration): render the View so it composes with its ViewModel + design system and mounts.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("${Plural}", () => {
  it("starts its resource in loading while the list is fetched (SKYFE005)", () => {
    const { result } = renderHook(() => use${Plural}Model(), { wrapper });
    expect(result.current.state.${collection}.status).toBe("loading");
  });

  it("renders the View without crashing (SKYFE006)", () => {
    const { container } = render(<${Plural}View />, { wrapper });
    expect(container).toBeTruthy();
  });
});
`;

  const assay = `import { productVerification } from "skies-frontend-sdk/product-verification";
import { defineVerification } from "avp-assay/react/vitest";

// AVP PROOFS — deliberately red until every declared product outcome is proven by a concrete assertion.
// Keep internal/unit mechanics in ${Plural}.test.tsx; only user-observable acceptance behavior belongs here.
${assayProofs}
`;

  const i18n = `// Feature-scoped copy. Three locales with identical keys (SKYFE011) — fill in the real strings.
export const ptBR = {
  error: "Não foi possível carregar.",
  "empty.title": "Nada por aqui ainda",
  "empty.description": "O que você criar aparece aqui.",
} as const;

export const esES = {
  error: "No pudimos cargar.",
  "empty.title": "Nada por aquí todavía",
  "empty.description": "Lo que crees aparecerá aquí.",
} as const;

export const enUS = {
  error: "We couldn't load.",
  "empty.title": "Nothing here yet",
  "empty.description": "What you create will show up here.",
} as const;
`;

  return {
    [`${Plural}.viewModel.ts`]: viewModel,
    [`${Plural}.view.tsx`]: view,
    [`${Plural}.test.tsx`]: test,
    [`${Plural}.assay.test.tsx`]: assay,
    [`${lower}.i18n.ts`]: i18n,
  };
}

/**
 * Render the design token contract — the single source the design layer hangs off (docs/DESIGN-CONVENTIONS.md).
 * Returns { filename: contents } for `tokens.ts`: the taxonomy types + this app's starting values. The names are
 * the convention (the design band lint-protects them); the values are the app's to edit. One plain TS data file —
 * platform-neutral (web inline styles, RN StyleSheet, a Tailwind theme all map FROM it), zero imports, zero deps.
 */
export function renderDesign() {
  const tokens = `// DESIGN TOKENS — this app's values for the Skies design taxonomy (docs/DESIGN-CONVENTIONS.md).
// Names are the convention, protected by the design band (SKYFE024-026); values are YOURS — edit the
// values freely (brand, dark mode, white-label), never the names. Raw colors (hex) live ONLY here
// (SKYFE012 exempts this file by name); everything else references the semantic \`color.*\` roles.

export type SpaceToken = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type RadiusToken = "none" | "sm" | "md" | "lg" | "full";
export type TextRole = "display" | "title" | "heading" | "body" | "label" | "caption";
export type ShadowToken = "none" | "raised" | "overlay";
export type MotionToken = "instant" | "fast" | "base" | "slow";
export type ColorRole =
  | "bg" | "surface" | "surfaceRaised" | "border" | "borderStrong"
  | "text" | "textMuted" | "textInverse"
  | "primary" | "primaryHover" | "primaryActive" | "onPrimary"
  | "danger" | "dangerHover" | "onDanger" | "dangerSurface"
  | "success" | "successSurface" | "warning" | "warningSurface"
  | "focusRing" | "scrim";

export interface TextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: 400 | 500 | 600 | 700;
}

/** Spacing — a 4px grid. Rhythm comes from the scale; there is no eighth step. */
export const space: Record<SpaceToken, number> = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32 };

/** Corner radii. \`full\` is the pill/circle. */
export const radius: Record<RadiusToken, number> = { none: 0, sm: 4, md: 8, lg: 12, full: 9999 };

/** Type — a 1.25 modular scale from 16. A role carries size + line-height + weight together. */
export const text: Record<TextRole, TextStyle> = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: 400 },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: 600 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: 600 },
  display: { fontSize: 31, lineHeight: 40, fontWeight: 700 },
};

/** Elevation levels — web box-shadow strings; a RN impl maps these to \`elevation\`. */
export const shadow: Record<ShadowToken, string> = {
  none: "none",
  raised: "0 1px 3px rgba(0,0,0,0.12)",
  overlay: "0 8px 24px rgba(0,0,0,0.16)",
};

/** Motion durations (ms). Timing is a system decision, not per-component creativity. */
export const motionMs: Record<MotionToken, number> = { instant: 0, fast: 100, base: 200, slow: 300 };

/** Layout breakpoints (px, min-width). Compact-first; layout shifts only at these. */
export const breakpoints = { compact: 0, regular: 768, wide: 1200 } as const;

/** The semantic themes — same role names, swapped values. Dark shipping proves the semantic layer. */
export const themes: { light: Record<ColorRole, string>; dark: Record<ColorRole, string> } = {
  light: {
    bg: "#f8fafc",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#64748b",
    textInverse: "#ffffff",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    primaryActive: "#1e40af",
    onPrimary: "#ffffff",
    danger: "#dc2626",
    dangerHover: "#b91c1c",
    onDanger: "#ffffff",
    dangerSurface: "#fef2f2",
    success: "#16a34a",
    successSurface: "#f0fdf4",
    warning: "#d97706",
    warningSurface: "#fffbeb",
    focusRing: "#2563eb",
    scrim: "rgba(15, 23, 42, 0.5)",
  },
  dark: {
    bg: "#0b1220",
    surface: "#111a2c",
    surfaceRaised: "#16213a",
    border: "#243049",
    borderStrong: "#334766",
    text: "#e6edf7",
    textMuted: "#94a3b8",
    textInverse: "#0f172a",
    primary: "#3b82f6",
    primaryHover: "#60a5fa",
    primaryActive: "#2563eb",
    onPrimary: "#0b1220",
    danger: "#ef4444",
    dangerHover: "#f87171",
    onDanger: "#0b1220",
    dangerSurface: "#2a1416",
    success: "#22c55e",
    successSurface: "#11251a",
    warning: "#f59e0b",
    warningSurface: "#2a2012",
    focusRing: "#60a5fa",
    scrim: "rgba(0, 0, 0, 0.6)",
  },
};

/** The default binding. Components read \`color.<role>\`; a theme switch rebinds values, never names. */
export const color: Record<ColorRole, string> = themes.light;
`;

  return { "tokens.ts": tokens };
}

/**
 * Render the assembled i18n resource tree from the discovered feature catalogs. `features` is a list of
 * { ns, importPath } (importPath relative to the output file, extensionless). The emitted module imports each
 * locale catalog and composes `resources` keyed by locale -> namespace — the thing the harness wired by hand.
 */
export function renderResources(features) {
  const sorted = [...features].sort((a, b) => a.ns.localeCompare(b.ns));
  const imports = sorted
    .map(
      (f) =>
        `import { ptBR as ${ident(f.ns)}_ptBR, esES as ${ident(f.ns)}_esES, enUS as ${ident(f.ns)}_enUS } from "${f.importPath}";`,
    )
    .join("\n");
  const locale = (suffix) => sorted.map((f) => `    ${JSON.stringify(f.ns)}: ${ident(f.ns)}_${suffix},`).join("\n");

  return `// GENERATED by tools/assemble-i18n.mjs — do not edit. Re-run to regenerate after adding/removing a feature.
${imports}

export const resources = {
  en: {
${locale("enUS")}
  },
  pt: {
${locale("ptBR")}
  },
  es: {
${locale("esES")}
  },
} as const;
`;
}
