import { test, type TestFunction, type TestOptions } from "vitest";

/** The closed proof layers understood by Skies gates. */
export enum TestKind {
  Unit = "unit",
  Integration = "integration",
  E2E = "e2e",
}

/** Whether an end-to-end journey proves a write's success or failure path. */
export enum JourneyPath {
  Happy = "happy",
  Sad = "sad",
}

/** Static and reporter-visible binding between one journey and the write operation it proves. */
export interface JourneyDefinition {
  /** Stable operation ID of the write slice under proof. */
  readonly covers: string;
  /** Success or failure path proved by this test. */
  readonly path: JourneyPath;
  /** Optional stable acceptance-criterion ID proved by the journey. */
  readonly criterion?: string;
}

/** Metadata emitted on every test declared through this package. */
export interface SkiesTestMetadata {
  readonly kind: TestKind;
  readonly journey?: JourneyDefinition;
}

declare module "@vitest/runner" {
  interface TaskMeta {
    /** Machine-readable proof metadata consumed by the Skies verdict inventory. */
    skies?: SkiesTestMetadata;
  }
}

/** Declare a fast, isolated proof with no real infrastructure. */
export function unit(name: string, handler: TestFunction, options?: TestOptions): void {
  declareTest(TestKind.Unit, name, handler, options);
}

/** Declare a proof that exercises real infrastructure such as PostgreSQL or HTTP. */
export function integration(name: string, handler: TestFunction, options?: TestOptions): void {
  declareTest(TestKind.Integration, name, handler, options);
}

/** Declare a cross-module proof against the application's real composition. */
export function e2e(name: string, handler: TestFunction, options?: TestOptions): void {
  declareTest(TestKind.E2E, name, handler, options);
}

/**
 * Declare the happy or sad end-to-end proof for one state-changing operation. The metadata is both statically
 * readable at the call site and present on Vitest's task for verdict reporters.
 */
export function journey(
  definition: JourneyDefinition,
  name: string,
  handler: TestFunction,
  options?: TestOptions,
): void {
  assertJourney(definition);
  test(name, skiesTestOptions(TestKind.E2E, options, definition), handler);
}

/** Options for booting an application's own explicit composition in a test. */
export interface TestHostOptions<TApplication, TOverrides> {
  /** Test-only dependencies passed into the same application factory production calls. */
  readonly overrides: TOverrides;
  /** The application's explicit composition function. */
  readonly create: (overrides: TOverrides) => TApplication | Promise<TApplication>;
  /** The application's real startup seed, run only after overrides have been composed. */
  readonly seed?: (application: TApplication) => void | Promise<void>;
  /** Optional transport/resource shutdown hook. */
  readonly close?: (application: TApplication) => void | Promise<void>;
}

/** A booted application plus its idempotent asynchronous shutdown boundary. */
export interface TestHost<TApplication> {
  readonly application: TApplication;
  close(): Promise<void>;
}

/**
 * Boot the real application factory with explicit overrides before startup seeding. No Express or persistence
 * dependency is hidden here: applications own their factory, overrides, seed, and close behavior.
 */
export async function startTestHost<TApplication, TOverrides>(
  options: TestHostOptions<TApplication, TOverrides>,
): Promise<TestHost<TApplication>> {
  const application = await options.create(options.overrides);
  try {
    await options.seed?.(application);
  } catch (caught) {
    await options.close?.(application);
    throw caught;
  }

  let closed = false;
  return {
    application,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await options.close?.(application);
    },
  };
}

function declareTest(kind: TestKind, name: string, handler: TestFunction, options?: TestOptions): void {
  test(name, skiesTestOptions(kind, options), handler);
}

export function skiesTestOptions(
  kind: TestKind,
  options: TestOptions = {},
  journeyDefinition?: JourneyDefinition,
): TestOptions {
  const skies: SkiesTestMetadata = journeyDefinition === undefined
    ? { kind }
    : { kind, journey: Object.freeze({ ...journeyDefinition }) };
  return { ...options, meta: { ...options.meta, skies } };
}

function assertJourney(definition: JourneyDefinition): void {
  if (definition.covers.trim().length === 0) throw new TypeError("Journey covers must be a non-empty operation ID.");
  if (definition.path !== JourneyPath.Happy && definition.path !== JourneyPath.Sad) {
    throw new TypeError("Journey path must be happy or sad.");
  }
  if (definition.criterion !== undefined && definition.criterion.trim().length === 0) {
    throw new TypeError("Journey criterion must be non-empty when supplied.");
  }
}
