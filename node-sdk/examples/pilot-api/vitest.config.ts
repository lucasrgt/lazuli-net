import { SkiesProofReporter } from "@skiesjs/testing/reporter";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 2,
    include: ["src/**/*.{test,spec,proof,avp,journey}.ts"],
    reporters: ["default", new SkiesProofReporter({
      outputFile: ".skies/foundation/vitest-receipt.json",
      requireMetadata: true,
    })],
  },
});
