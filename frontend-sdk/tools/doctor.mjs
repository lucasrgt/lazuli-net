// SKYFE doctor — the aggregation core behind the single front-door that captures "the whole crew" in one pass.
// A consumer (e.g. an app's `scripts/skyfe-doctor.mjs`) does the I/O — runs `eslint --format json`, resolves each
// rule's configured level via `eslint --print-config`, and runs the script-doctors (SKYFE008 endpoint coverage,
// SKYFE-E2E, SKYFE-JOURNEY) — then feeds the raw results here. `aggregateReport` is PURE (no I/O), so it is unit-
// testable and the same core powers both the human dashboard and the `--json` machine output.
//
// Why one report: a frontend has many lint surfaces (SKYFE architecture rules, the community kit, expo's set) plus
// the fullstack loops. Scattered across four commands they are easy to half-read. Aggregated and BUCKETED, a
// warn->error promotion becomes an evidence-backed move: you can see, in one place, which rules are gated, which
// are a revealed backlog, and which are already clean (0 hits) and therefore ready to promote.

/** The SKYFE rule -> code map. Drives the architecture bucket + the clean-roster view. */
export const SKYFE_CODES = {
  "skies/view-purity": "SKYFE001",
  "skies/data-door": "SKYFE002",
  "skies/no-mock": "SKYFE003",
  "skies/test-colocated": "SKYFE005",
  "skies/view-integration-test": "SKYFE006",
  "skies/viewmodel-platform-agnostic": "SKYFE009",
  "skies/state-completeness": "SKYFE010",
  "skies/i18n-completeness": "SKYFE011",
  "skies/design-tokens": "SKYFE012",
  "skies/mutation-error-handled": "SKYFE013",
  "skies/no-hardcoded-copy": "SKYFE014",
  "skies/no-router-replace-in-effect": "SKYFE015",
  "skies/session-one-door": "SKYFE016",
  "skies/guard-tristate": "SKYFE017",
  "skies/route-param-guard": "SKYFE018",
  "skies/safe-back": "SKYFE019",
  "skies/no-hardcoded-base-url": "SKYFE020",
  "skies/no-raw-html": "SKYFE021",
  "skies/no-open-redirect": "SKYFE022",
  "skies/ui-door": "SKYFE024",
  "skies/scale-only": "SKYFE025",
  "skies/semantic-colors": "SKYFE026",
  "skies/query-client-defaults": "SKYFE027",
  "skies/no-manual-refetch-ritual": "SKYFE028",
  "skies/refresh-one-door": "SKYFE029",
  "skies/no-cast-navigation": "SKYFE030",
  "skies/submit-handles-invalid": "SKYFE031",
  "skies/controller-field-state": "SKYFE032",
  "skies/verify-has-avp-proof": "SKYFE033",
  "skies/no-disabled-tests": "SKYFE034",
  "skies/feature-has-e2e-flow": "SKYFE035",
};

/**
 * Which dashboard bucket a fired rule belongs to.
 * @param {string} ruleId
 * @returns {"skyfe"|"community"|"platform"|"parse"}
 */
export function bucket(ruleId) {
  if (!ruleId) return "parse";
  if (ruleId.startsWith("skies/")) return "skyfe";
  if (
    ruleId.startsWith("@tanstack/") ||
    ruleId.startsWith("no-secrets/") ||
    ruleId.startsWith("sonarjs/") ||
    ruleId.startsWith("@typescript-eslint/") ||
    ruleId.startsWith("@vitest/") ||
    ruleId.startsWith("vitest/")
  )
    return "community";
  return "platform"; // expo / react-hooks / import / core
}

/**
 * Aggregate an `eslint --format json` run + the script-doctor outputs into one structured report.
 * @param {object} input
 * @param {{ filePath: string, messages: { ruleId: string|null, severity: number }[] }[]} input.eslintResults
 * @param {Record<string,"error"|"warn"|"off">} [input.ruleLevels] - configured level per rule (incl. 0-hit rules)
 * @param {Record<string,string>} [input.loops] - script-doctor summary lines (endpoint / e2e / journey)
 */
export function aggregateReport({ eslintResults, ruleLevels = {}, loops = {} }) {
  const byRule = {};
  let errors = 0;
  let warnings = 0;
  for (const f of eslintResults) {
    for (const m of f.messages) {
      const id = m.ruleId || "(parse error)";
      (byRule[id] ??= { error: 0, warn: 0, files: new Set() });
      if (m.severity === 2) {
        byRule[id].error++;
        errors++;
      } else {
        byRule[id].warn++;
        warnings++;
      }
      byRule[id].files.add(f.filePath);
    }
  }

  const rules = {};
  for (const [id, v] of Object.entries(byRule)) {
    rules[id] = {
      error: v.error,
      warn: v.warn,
      files: v.files.size,
      bucket: bucket(id),
      level: ruleLevels[id] ?? "?",
      code: SKYFE_CODES[id],
    };
  }

  // SKYFE rules with 0 hits — the clean roster. A `warn`-level clean rule is a promotion candidate; an `error`-level
  // one is already a gate proving its invariant holds.
  const cleanSkyfe = Object.keys(SKYFE_CODES)
    .filter((id) => !byRule[id])
    .map((id) => ({ id, code: SKYFE_CODES[id], level: ruleLevels[id] ?? "?" }));

  return {
    summary: { errors, warnings, rules: Object.keys(byRule).length },
    rules,
    cleanSkyfe,
    loops,
    ok: errors === 0,
  };
}
