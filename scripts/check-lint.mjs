import { ESLint } from "eslint";
import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";

const baselinePath = new URL("../eslint-baseline.json", import.meta.url);
const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);
const counts = new Map();
const findings = [];

for (const result of results) {
  const path = relative(process.cwd(), result.filePath).replaceAll("\\", "/");
  for (const message of result.messages) {
    const key = [path, message.ruleId ?? "parser", message.severity].join(" | ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    findings.push({ key, path, message });
  }
}

if (process.argv.includes("--record")) {
  const record = Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
  await writeFile(baselinePath, JSON.stringify(record, null, 2) + "\n");
} else {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const exceeding = new Set([...counts].flatMap(([key, count]) => count > (baseline[key] ?? 0) ? [key] : []));
  if (exceeding.size) {
    for (const { key, path, message } of findings) {
      if (exceeding.has(key)) console.error(path + ":" + message.line + " " + (message.ruleId ?? "") + " " + message.message.split("\n")[0]);
    }
    process.exitCode = 1;
  } else {
    const errors = results.reduce((sum, item) => sum + item.errorCount, 0);
    const warnings = results.reduce((sum, item) => sum + item.warningCount, 0);
    console.log("ESLint sin aumentos sobre la base registrada. Quedan " + errors + " errores y " + warnings + " avisos.");
  }
}
