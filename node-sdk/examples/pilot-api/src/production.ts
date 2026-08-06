import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { AccessTokens, SystemClock, type Clock } from "@skiesjs/auth";
import { LocalFileStorage } from "@skiesjs/storage";
import { createApplication, type PilotApplication } from "./app.js";
import { openWalletDatabase } from "./modules/wallets/wallet.queries.js";

export interface PilotConfiguration {
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly storageRoot?: string;
}

export interface RunningApplication extends PilotApplication {
  close(): Promise<void>;
}

export async function createProductionApplication(
  configuration: PilotConfiguration,
  clock: Clock = SystemClock,
): Promise<RunningApplication> {
  const storageRoot = await prepareStorageRoot(configuration.storageRoot);
  const database = openWalletDatabase(configuration.databaseUrl);
  const accessTokens = new AccessTokens(
    configuration.jwtSecret,
    configuration.jwtIssuer,
    configuration.jwtAudience,
    clock,
  );
  const storage = new LocalFileStorage(storageRoot.path, "/files");
  const application = createApplication({ accessTokens, storage, listWallets: database.listWallets });

  return {
    ...application,
    async close(): Promise<void> {
      try {
        await database.close();
      } finally {
        if (storageRoot.temporary) await rm(storageRoot.path, { recursive: true, force: true });
      }
    },
  };
}

interface PreparedStorageRoot {
  readonly path: string;
  readonly temporary: boolean;
}

async function prepareStorageRoot(configuredRoot: string | undefined): Promise<PreparedStorageRoot> {
  if (configuredRoot === undefined || configuredRoot.trim().length === 0) {
    const path = await mkdtemp(join(tmpdir(), "skies-wallet-pilot-"));
    await chmod(path, 0o700);
    return { path, temporary: true };
  }
  if (!isAbsolute(configuredRoot)) throw new TypeError("STORAGE_ROOT must be an absolute path");
  const path = resolve(configuredRoot);
  await mkdir(path, { recursive: true, mode: 0o700 });
  return { path, temporary: false };
}

export function configurationFromEnvironment(environment: NodeJS.ProcessEnv): PilotConfiguration {
  const databaseUrl = required(environment, "DATABASE_URL");
  const jwtSecret = required(environment, "JWT_SECRET");
  const jwtIssuer = environment.JWT_ISSUER?.trim() || "skies-wallet-pilot";
  const jwtAudience = environment.JWT_AUDIENCE?.trim() || "skies-wallet-pilot-api";
  const storageRoot = environment.STORAGE_ROOT?.trim();
  return storageRoot === undefined || storageRoot.length === 0
    ? { databaseUrl, jwtSecret, jwtIssuer, jwtAudience }
    : { databaseUrl, jwtSecret, jwtIssuer, jwtAudience, storageRoot };
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (value === undefined || value.length === 0) throw new TypeError(`${name} is required`);
  return value;
}
