import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Lucy prompt changelog governance", () => {
  it("contains required logging fields for every prompt revision", () => {
    const filePath = path.join(process.cwd(), "docs/lucy-prompt-changelog.md");
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).toContain("Change ID");
    expect(content).toContain("Hypothesis");
    expect(content).toContain("Diff Summary");
    expect(content).toContain("Affected Scenarios");
    expect(content).toContain("Expected Metric Movement");
    expect(content).toContain("Observed Results");
    expect(content).toContain("Decision");
  });
});

