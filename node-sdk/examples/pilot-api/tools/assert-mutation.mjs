import { readFile } from "node:fs/promises";

const report = JSON.parse(await readFile(new URL("../.stryker-tmp/reports/mutation.json", import.meta.url), "utf8"));
const mutants = Object.values(report.files).flatMap((file) => file.mutants);
const counts = mutants.reduce((result, mutant) => {
  result[mutant.status] = (result[mutant.status] ?? 0) + 1;
  return result;
}, {});
const rejected = mutants.filter((mutant) => !["Killed", "CompileError"].includes(mutant.status));
if ((counts.Killed ?? 0) === 0) throw new Error("mutation calibration killed no runtime mutant");
if (rejected.length > 0) {
  throw new Error(`mutation gate rejected ${rejected.length} mutant(s): ${JSON.stringify(counts)}`);
}
console.log(`mutation gate passed: ${JSON.stringify(counts)}`);
