import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runLucyAutonomousIteration } from "@/lib/onboarding/lucy/autonomousProtocol";

describe("Lucy autonomous testing protocol", () => {
  it("runs the 15-scenario protocol and writes a debug report artifact", async () => {
    const report = await runLucyAutonomousIteration(1);
    await mkdir(".tmp", { recursive: true });
    await writeFile(".tmp/lucy-autonomous-latest.json", JSON.stringify(report, null, 2), "utf8");

    expect(report.scenario_count).toBe(15);
    expect(report.scenario_results.length).toBe(15);
    expect(report.average_scores.extraction_accuracy).toBeGreaterThanOrEqual(1);
    expect(report.average_scores.completion).toBeGreaterThanOrEqual(1);
    expect(report.prioritized_issues.length).toBeGreaterThanOrEqual(0);
  });
});
