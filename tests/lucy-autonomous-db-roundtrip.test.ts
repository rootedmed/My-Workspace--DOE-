import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runLucyAutonomousIteration } from "@/lib/onboarding/lucy/autonomousProtocol";
import { roundTripLucyStateForTest } from "@/lib/onboarding/lucy/store";

describe("Lucy autonomous protocol with persistence round-trips", () => {
  it("runs the full 15-scenario suite with per-turn store hydration", async () => {
    const report = await runLucyAutonomousIteration(1, {
      roundTripStateEachTurn: (state) => roundTripLucyStateForTest(state)
    });

    await mkdir(".tmp", { recursive: true });
    await writeFile(".tmp/lucy-autonomous-db-roundtrip-latest.json", JSON.stringify(report, null, 2), "utf8");

    expect(report.scenario_count).toBe(15);
    expect(report.scenario_results.length).toBe(15);
    expect(report.overall_average).toBeGreaterThanOrEqual(3.5);
    expect(report.average_scores.completion).toBeGreaterThanOrEqual(4);

    const noLoopIssues = report.prioritized_issues.filter(
      (issue) => issue.code === "technical_loop" || issue.code === "repeated_prompt"
    );
    expect(noLoopIssues.length).toBe(0);
  });
});

