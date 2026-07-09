import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalCaseResult } from "./assertions";

export interface EvalReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
  cases: EvalCaseResult[];
}

export async function writeEvalReport(report: EvalReport): Promise<string> {
  const resultsDir = join(process.cwd(), "evals", "results");
  await mkdir(resultsDir, { recursive: true });
  const filename = `${report.startedAt.replace(/[:.]/g, "-")}.json`;
  const path = join(resultsDir, filename);
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}

export function buildReport(
  runId: string,
  startedAt: string,
  cases: EvalCaseResult[],
): EvalReport {
  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.length - passed;
  const finishedAt = new Date().toISOString();
  const durationMs = cases.reduce((sum, item) => sum + item.metrics.durationMs, 0);

  return {
    runId,
    startedAt,
    finishedAt,
    durationMs,
    summary: {
      total: cases.length,
      passed,
      failed,
      passRate: cases.length === 0 ? 0 : passed / cases.length,
    },
    cases,
  };
}

export function formatReportSummary(report: EvalReport): string {
  const lines = [
    `Eval run ${report.runId}`,
    `Passed ${report.summary.passed}/${report.summary.total} (${(report.summary.passRate * 100).toFixed(1)}%)`,
  ];

  for (const item of report.cases) {
    const status = item.passed ? "PASS" : "FAIL";
    lines.push(`  [${status}] ${item.caseId}${item.error ? ` — ${item.error}` : ""}`);
    if (!item.passed) {
      for (const assertion of item.assertionResults.filter((result) => !result.passed)) {
        lines.push(`         ↳ ${assertion.name}: ${assertion.message ?? "failed"}`);
      }
    }
  }

  return lines.join("\n");
}
