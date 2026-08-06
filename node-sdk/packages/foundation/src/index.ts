export { main, type CliIo } from "./cli.js";
export {
  CSM_CONFIG,
  FOUNDATION_INSTRUCTIONS,
  FOUNDATION_VERSION,
  checkFoundationAssets,
  defaultFoundationFiles,
  installFoundationAssets,
  loadCsmConfig,
  type CsmConfig,
  type FoundationAssetsOptions,
  type FoundationAssetsResult,
  type FoundationTextFile,
} from "./assets.js";
export {
  readCsmRecords,
  recordsHuman,
  resolveDeferment,
  writeCsmRecord,
  type CsmFamily,
  type CsmRecord,
  type RecordInput,
  type RecordRead,
  type WtwKind,
} from "./csm.js";
export { loadConfig, normalizeRelativePath, parseConfig } from "./config.js";
export { matchesScope, runGate, selectProofs, type Selection } from "./gate.js";
export { scanSuppressions } from "./suppression.js";
export {
  buildInventory,
  coverageRows,
  criteriaFindings,
  inventoryHuman,
  matrixFromReceipt,
  matrixHuman,
  type Inventory,
  type InventoryProof,
} from "./inventory.js";
export { DefaultGitClient, defaultCommandRunner } from "./runner.js";
export { applyTextPlan, assertSafeDirectory, readSafeText, withinRoot, type TextAction, type TextChange } from "./safe-fs.js";
export { runContext, runFoundationCheck, type CheckOptions, type CheckResult, type ContextOptions, type ContextResult } from "./workflow.js";
export * from "./types.js";
