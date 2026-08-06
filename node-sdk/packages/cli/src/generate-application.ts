import path from "node:path";
import { defaultFoundationFiles } from "@skiesjs/foundation";
import { apply, type FilePlan } from "./file-plan.js";
import { toKebab } from "./naming.js";
import {
  appSource,
  applicationPackageSource,
  applicationReadmeSource,
  applicationTestTsconfigSource,
  applicationTsconfigSource,
  eslintConfigSource,
  healthContextSource,
  healthModuleSource,
  healthSliceSource,
  healthSliceTestSource,
  modulesSource,
  nodeCiSource,
  preCommitHookSource,
  prePushHookSource,
  proofManifestSource,
  serverSource,
  vitestConfigSource,
} from "./templates-application.js";

export interface GenerateApplicationOptions {
  readonly cwd: string;
  readonly directory: string;
  readonly name?: string;
  readonly dryRun?: boolean;
}

function applicationRoot(cwd: string, directory: string): { readonly cwd: string; readonly target: string } {
  const absoluteCwd = path.resolve(cwd);
  const target = path.resolve(absoluteCwd, directory);
  const relative = path.relative(absoluteCwd, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`application directory escapes cwd: ${directory}`);
  }
  return { cwd: absoluteCwd, target };
}

function packageName(options: GenerateApplicationOptions, target: string): string {
  const candidate = options.name ?? toKebab(path.basename(target));
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(candidate)) {
    throw new Error("application name must be a lowercase npm package name");
  }
  return candidate;
}

/** Create a complete runnable application in one all-or-nothing file plan. */
export async function generateApplication(options: GenerateApplicationOptions): Promise<readonly string[]> {
  if (options.directory.trim().length === 0) throw new Error("application directory must not be blank");
  const roots = applicationRoot(options.cwd, options.directory);
  const name = packageName(options, roots.target);
  const health = path.join(roots.target, "src", "modules", "health");
  const plan: FilePlan = {
    root: roots.cwd,
    files: [
      { target: path.join(roots.target, "package.json"), contents: applicationPackageSource(name) },
      { target: path.join(roots.target, "tsconfig.json"), contents: applicationTsconfigSource() },
      { target: path.join(roots.target, "tsconfig.test.json"), contents: applicationTestTsconfigSource() },
      { target: path.join(roots.target, "eslint.config.js"), contents: eslintConfigSource() },
      { target: path.join(roots.target, "vitest.config.ts"), contents: vitestConfigSource() },
      {
        target: path.join(roots.target, ".gitignore"),
        contents: "node_modules/\ndist/\n.data/\n.skies/foundation/gate-receipt.json\n.skies/foundation/vitest-receipt.json\n",
      },
      { target: path.join(roots.target, "README.md"), contents: applicationReadmeSource(name) },
      { target: path.join(roots.target, "skies.node.json"), contents: proofManifestSource() },
      { target: path.join(roots.target, ".github/workflows/ci.yml"), contents: nodeCiSource() },
      { target: path.join(roots.target, ".githooks/pre-commit"), contents: preCommitHookSource(), mode: 0o755 },
      { target: path.join(roots.target, ".githooks/pre-push"), contents: prePushHookSource(), mode: 0o755 },
      ...defaultFoundationFiles().map((file) => ({
        target: path.join(roots.target, file.path),
        contents: file.content,
      })),
      { target: path.join(roots.target, "src", "app.ts"), contents: appSource(name) },
      { target: path.join(roots.target, "src", "server.ts"), contents: serverSource() },
      { target: path.join(roots.target, "src", "modules.ts"), contents: modulesSource() },
      { target: path.join(health, "health.module.ts"), contents: healthModuleSource() },
      { target: path.join(health, "health.ctx.md"), contents: healthContextSource() },
      { target: path.join(health, "ping.slice.ts"), contents: healthSliceSource() },
      { target: path.join(health, "ping.slice.test.ts"), contents: healthSliceTestSource() },
    ],
  };
  return apply(plan, { dryRun: options.dryRun ?? false });
}
