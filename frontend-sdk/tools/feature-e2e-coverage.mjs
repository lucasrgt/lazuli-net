#!/usr/bin/env node
// SKYFE-FEATURE-E2E — visible feature -> executable journey coverage.
//
// e2e-doctor proves every flow declared by a surface has an executable spec. This tool proves the inverse:
// every ViewModel (the convention's user-visible feature boundary) declares `@e2e <flow-id>`, and every id
// resolves to a flow owned by one of the product's executable surfaces. Shared core ViewModels are checked
// against the union of all surface manifests, so a core never pretends to own a browser while still owing a
// real consumer journey.
//
// Complete depth is universal: every ViewModel owns linked happy and sad flows, and each flow names the exact
// feature it proves. A backend slice with no frontend consumer remains backend-only; once its hook enters one or
// more ViewModels, at least one real subject flow from that consumer set must prove it. Shared queries are not
// re-paid by every importer. Infrastructure data doors retain happy+sad evidence because they affect every route.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".skies",
  "bin",
  "node_modules",
  "obj",
  "output",
  "storybook",
  "test-results",
  "tmp",
]);

/** Directories outside the production application graph never create feature or endpoint obligations. */
export function isIgnoredSourceDirectory(name) {
  return IGNORED_DIRECTORIES.has(name);
}

/** Stable flow ids declared by a ViewModel through `@e2e <id>`. */
export function extractE2eObligations(source) {
  return [...new Set(
    [...source.matchAll(/@e2e\s+([a-z0-9][a-z0-9._-]*)\b/gi)].map((match) => match[1]),
  )];
}

/** Acceptance criteria declared by a ViewModel through `@verify <criterion-id>`. */
export function extractVerificationCriteria(source) {
  return [...new Set(
    [...source.matchAll(/@verify\s+([a-z0-9][a-z0-9._-]*)\b/gi)].map((match) => match[1]),
  )];
}

function sliceDeclarations(sources) {
  const declarations = [];
  for (const source of sources) {
    let ownsSlice = false;
    const classes = source.matchAll(
      /((?:^\s*\[[^\]\r\n]+\]\s*(?:\/\/[^\r\n]*)?\r?\n)+)\s*public\s+static\s+class\s+([A-Za-z_]\w*)/gm,
    );
    for (const match of classes) {
      const attributes = match[1];
      if (!/\bSlice(?:Attribute)?\b/.test(attributes)) continue;
      ownsSlice = true;
      declarations.push({ name: match[2] });
    }
    if (!ownsSlice) continue;

    // A slice may map more than one explicitly named operation. Generated clients and the browser ledger
    // identify those operations by WithName rather than by the containing class, so both identities belong to
    // the same proof inventory until the pilot splits the mappings into one class per slice.
    for (const match of source.matchAll(/\.WithName\s*\(\s*"([A-Za-z_]\w*)"\s*\)/g))
      declarations.push({ name: match[1] });
  }
  return declarations;
}

/** Every backend slice class and explicitly named operation identity from ordinary C# source files. */
export function extractSlices(sources) {
  return [...new Set(sliceDeclarations(sources).map(({ name }) => name))].sort();
}

/** Backend hooks consumed directly by one frontend data door. */
export function sliceHooks(source, slices) {
  const imports = new Set();
  const declarations = source.matchAll(
    /\bimport\s+(?!type\b)\{([^}]*)\}\s+from\s+["'][^"']*client\.gen(?:\/[^"']*)?["']/g,
  );
  for (const declaration of declarations) {
    for (const raw of declaration[1].split(",")) {
      const specifier = raw.trim();
      if (!specifier || specifier.startsWith("type ")) continue;
      imports.add(specifier.split(/\s+as\s+/)[0].trim());
    }
  }
  return slices.filter((slice) => {
    const operation = slice.charAt(0).toLowerCase() + slice.slice(1);
    return imports.has(`use${slice}`) || imports.has(operation);
  }).sort();
}

/** Literal raw HTTP calls that bypass the generated client inside an infrastructure seam. */
export function directBackendCalls(source) {
  const calls = [];
  const memberCalls = source.matchAll(
    /\.\s*(delete|get|head|options|patch|post|put)\s*(?:<[^;\r\n]*?>)?\s*\(\s*(["'])(\/[^"']*)\2/g,
  );
  for (const match of memberCalls) calls.push({ method: match[1].toUpperCase(), path: match[3] });
  const fetchCalls = source.matchAll(/\bfetch\s*\(\s*(["'])(\/[^"']*)\1/g);
  for (const match of fetchCalls) calls.push({ method: "GET", path: match[2] });
  return [...new Map(calls.map((call) => [`${call.method} ${call.path}`, call])).values()];
}

/** Explicit slice identity for an unavoidable raw infrastructure call: `@backendSlice Refresh POST /refresh`. */
export function extractBackendSliceObligations(source) {
  return [...source.matchAll(
    /@backendSlice\s+([A-Za-z_]\w*)\s+(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\s+(\/\S+)/g,
  )].map((match) => ({ slice: match[1], method: match[2], path: match[3] }));
}

/**
 * Check the complete feature -> flow mapping.
 * @param {{ path: string, source: string }[]} viewModels
 * @param {{ id?: string, path?: string, features?: string[], criteria?: { id?: string, evidence?: string }[], backendSlices?: string[], __surface?: string }[]} flows
 * @param {string[]} slices
 * @param {{ path: string, source: string }[]} infrastructure
 */
export function checkFeatureE2e(viewModels, flows, slices, infrastructure = []) {
  const messages = [];
  let gaps = 0;
  const byId = new Map();
  const featureNames = viewModels.map((viewModel) => basename(viewModel.path).replace(/\.viewModel\.tsx?$/i, ""));
  for (const duplicate of featureNames.filter((feature, index) => featureNames.indexOf(feature) !== index)) {
    messages.push(`ViewModel feature id "${duplicate}" is duplicated; filenames must identify one proof subject`);
    gaps += 1;
  }

  for (const flow of flows) {
    const id = typeof flow?.id === "string" ? flow.id.trim() : "";
    if (!id) continue; // e2e-doctor owns malformed flow shape; unresolved obligations still fail below.
    if (byId.has(id)) {
      messages.push(`flow id "${id}" is duplicated across frontend surfaces`);
      gaps += 1;
      continue;
    }
    byId.set(id, flow);
    if (flow.features !== undefined && (!Array.isArray(flow.features)
      || flow.features.length !== 1
      || flow.features.some((feature) => typeof feature !== "string" || !feature.trim()))) {
      messages.push(`flow id "${id}" must own exactly one ViewModel through features:["FeatureName"]`);
      gaps += 1;
    }
    for (const feature of flow.features ?? []) {
      if (featureNames.includes(feature)) continue;
      messages.push(`flow id "${id}" links unknown ViewModel feature "${feature}"`);
      gaps += 1;
    }
    for (const slice of flow.backendSlices ?? []) {
      if (slices.includes(slice)) continue;
      messages.push(`flow id "${id}" links unknown backend slice "${slice}"`);
      gaps += 1;
    }
  }

  let linked = 0;
  let complete = 0;
  let criteria = 0;
  let coveredCriteria = 0;
  const hookConsumers = new Map();
  for (const viewModel of viewModels) {
    const feature = basename(viewModel.path).replace(/\.viewModel\.tsx?$/i, "");
    const verificationCriteria = extractVerificationCriteria(viewModel.source);
    criteria += verificationCriteria.length;
    for (const hook of sliceHooks(viewModel.source, slices)) {
      const consumers = hookConsumers.get(hook) ?? new Set();
      consumers.add(feature);
      hookConsumers.set(hook, consumers);
    }
    const obligations = extractE2eObligations(viewModel.source);
    const featureOwnedFlows = flows.filter((flow) => flow.features?.includes(feature));
    if (obligations.length === 0) {
      messages.push(`${viewModel.path}: ${feature} declares no \`@e2e <flow-id>\` browser/device journey`);
      gaps += 1;
      if (featureOwnedFlows.length === 0) continue;
    }

    const resolvedFlows = [];
    for (const id of obligations) {
      const flow = byId.get(id);
      if (!flow) {
        messages.push(`${viewModel.path}: @e2e ${id} resolves to no surface e2e/flows.json entry`);
        gaps += 1;
      } else {
        resolvedFlows.push(flow);
      }
    }
    const subjectFlows = featureOwnedFlows;
    for (const flow of subjectFlows) {
      if (obligations.includes(flow.id)) continue;
      messages.push(
        `${viewModel.path}: feature-owned flow "${flow.id}" must be declared with @e2e ${flow.id}; `
          + "flow ownership is bidirectional and cannot sit outside the ViewModel's verification inventory",
      );
      gaps += 1;
    }
    for (const flow of resolvedFlows) {
      if (flow.features?.includes(feature)) continue;
      messages.push(`${viewModel.path}: linked flow "${flow.id}" does not declare features:["${feature}"]`);
      gaps += 1;
    }
    if (subjectFlows.length === 0) continue;
    if (subjectFlows.length > 0) linked += 1;

    const paths = new Set(subjectFlows.map((flow) => flow.path));
    for (const required of ["happy", "sad"]) {
      if (paths.has(required)) continue;
      messages.push(`${viewModel.path}: complete verification requires a subject-bound @e2e flow with path:${required}`);
      gaps += 1;
    }
    if (paths.has("happy") && paths.has("sad")) complete += 1;

    if (verificationCriteria.length > 0) {
      const provenCriteria = new Set();
      const criterionOwners = new Map();
      for (const flow of subjectFlows) {
        if (!Array.isArray(flow.criteria) || flow.criteria.length === 0) {
          messages.push(
            `${viewModel.path}: subject flow "${flow.id}" declares no criteria; `
              + "happy/sad labels are a floor, not semantic proof",
          );
          gaps += 1;
          continue;
        }
        for (const entry of flow.criteria) {
          const criterion = typeof entry?.id === "string" ? entry.id : "";
          if (!verificationCriteria.includes(criterion)) {
            messages.push(
              `${viewModel.path}: flow "${flow.id}" claims undeclared criterion "${criterion}"; `
                + `declare @verify ${criterion} and its co-located @avp Assay proof`,
            );
            gaps += 1;
            continue;
          }
          const previousOwner = criterionOwners.get(criterion);
          if (previousOwner) {
            messages.push(
              `${viewModel.path}: @verify ${criterion} is claimed by both "${previousOwner}" and "${flow.id}"; `
                + "one semantic criterion must have one executable E2E proof case",
            );
            gaps += 1;
            continue;
          }
          criterionOwners.set(criterion, flow.id);
          provenCriteria.add(criterion);
        }
      }
      for (const criterion of verificationCriteria) {
        if (provenCriteria.has(criterion)) {
          coveredCriteria += 1;
          continue;
        }
        messages.push(
          `${viewModel.path}: @verify ${criterion} has an Assay obligation but no subject E2E flow cites it in criteria`,
        );
        gaps += 1;
      }
    }

  }

  for (const [hook, consumers] of hookConsumers) {
    const proofs = flows.filter((flow) => flow.backendSlices?.includes(hook)
      && flow.features?.some((feature) => consumers.has(feature)));
    if (proofs.length > 0) continue;
    messages.push(
      `use${hook} is UI-consumed by ${[...consumers].sort().join(", ")} but no subject flow from those features `
        + `declares backendSlices:["${hook}"]`,
    );
    gaps += 1;
  }

  for (const dataDoor of infrastructure) {
    const calls = directBackendCalls(dataDoor.source);
    const declarations = extractBackendSliceObligations(dataDoor.source);
    for (const call of calls) {
      if (declarations.some((item) => item.method === call.method && item.path === call.path)) continue;
      messages.push(
        `${dataDoor.path}: raw ${call.method} ${call.path} must declare `
          + `@backendSlice <SliceName> ${call.method} ${call.path}`,
      );
      gaps += 1;
    }
    for (const declaration of declarations) {
      if (!slices.includes(declaration.slice)) {
        messages.push(`${dataDoor.path}: @backendSlice names unknown slice ${declaration.slice}`);
        gaps += 1;
      }
      if (calls.some((call) => call.method === declaration.method && call.path === declaration.path)) continue;
      messages.push(
        `${dataDoor.path}: @backendSlice ${declaration.slice} has no matching raw `
          + `${declaration.method} ${declaration.path} call`,
      );
      gaps += 1;
    }

    const directSlices = declarations
      .filter((declaration) => slices.includes(declaration.slice)
        && calls.some((call) => call.method === declaration.method && call.path === declaration.path))
      .map((declaration) => declaration.slice);
    const dataDoorSlices = new Set([...sliceHooks(dataDoor.source, slices), ...directSlices]);
    const dataDoorProofs = [];
    for (const hook of dataDoorSlices) {
      const proofs = flows.filter((flow) => flow.backendSlices?.includes(hook));
      if (proofs.length === 0) {
        messages.push(`${dataDoor.path}: use${hook} is UI infrastructure with no E2E flow declaring that backend slice`);
        gaps += 1;
        continue;
      }
      dataDoorProofs.push(...proofs);
    }
    if (dataDoorProofs.length === 0) continue;
    const paths = new Set(dataDoorProofs.map((flow) => flow.path));
    for (const required of ["happy", "sad"]) {
      if (dataDoorSlices.size === 0 || paths.has(required)) continue;
      messages.push(`${dataDoor.path}: infrastructure data door requires an E2E flow with path:${required}`);
      gaps += 1;
    }
  }

  return { features: viewModels.length, linked, complete, criteria, coveredCriteria, gaps, messages };
}

function walk(root, predicate) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && isIgnoredSourceDirectory(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path, predicate));
    else if (entry.isFile() && predicate(path)) files.push(path);
  }
  return files;
}

function readFlows(surface) {
  const path = join(surface, "e2e", "flows.json");
  if (!existsSync(path) || !statSync(path).isFile()) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${path}: flows manifest must be an array`);
  return parsed.map((flow) => ({ ...flow, __surface: surface }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , workspaceArgument, ...packageArguments] = process.argv;
  if (!workspaceArgument || packageArguments.length === 0) {
    console.error("usage: skyfe-feature-e2e <workspace-root> <core=path|surface=path> [...more-packages]");
    process.exit(2);
  }

  try {
    const workspace = resolve(workspaceArgument);
    const packages = packageArguments.map((argument) => {
      const separator = argument.indexOf("=");
      if (separator < 1) throw new Error(`invalid package argument: ${argument}`);
      const role = argument.slice(0, separator);
      if (role !== "core" && role !== "surface") throw new Error(`unknown frontend role: ${role}`);
      return { role, path: resolve(argument.slice(separator + 1)) };
    });
    const frontendFiles = packages.flatMap(({ path }) =>
      walk(join(path, "src"), (file) => /\.[cm]?[jt]sx?$/i.test(file)
        && !/[\\/]client\.gen[\\/]/i.test(file)));
    const viewModels = frontendFiles
      .filter((file) => /\.viewModel\.tsx?$/i.test(file))
      .map((file) => ({ path: file, source: readFileSync(file, "utf8") }));
    const infrastructure = frontendFiles
      .filter((file) => !/\.viewModel\.tsx?$/i.test(file) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file))
      .map((file) => ({ path: file, source: readFileSync(file, "utf8") }));
    const backendSources = walk(workspace, (file) => file.endsWith(".cs"))
      .map((file) => readFileSync(file, "utf8"));
    const slices = extractSlices(backendSources);
    const flows = packages
      .filter(({ role }) => role === "surface")
      .flatMap(({ path }) => readFlows(path));
    const result = checkFeatureE2e(viewModels, flows, slices, infrastructure);
    console.log(
      `SKYFE-FEATURE-E2E: ${result.linked}/${result.features} ViewModel feature(s) linked; `
        + `${result.complete} complete happy+sad feature(s); `
        + `${result.coveredCriteria}/${result.criteria} AVP/Assay criterion/criteria covered; `
        + `${result.gaps} coverage gap(s).`,
    );
    for (const message of result.messages) console.log(`  - ${message}`);
    process.exit(result.gaps > 0 ? 1 : 0);
  } catch (error) {
    console.log(`SKYFE-FEATURE-E2E: invalid coverage input — ${error.message}`);
    process.exit(1);
  }
}
