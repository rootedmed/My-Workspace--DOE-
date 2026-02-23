import { describe, expect, it } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { assignLucyVariant } from "@/lib/onboarding/lucy/experiments";

describe("Lucy experiment assignment", () => {
  it("assigns a stable 50/50 variant per user id", () => {
    const first = assignLucyVariant("user-abc");
    const second = assignLucyVariant("user-abc");

    expect(first).toBe(second);
    expect(["control_a", "treatment_b"]).toContain(first);
  });

  it("includes variant and prompt/model metadata in initial session control flags", () => {
    const seed = createInitialLucySession("user-1");

    expect(["control_a", "treatment_b"]).toContain(seed.control_flags.experiment_variant);
    expect(seed.control_flags.model_version.length).toBeGreaterThan(0);
    expect(seed.control_flags.prompt_version.length).toBeGreaterThan(0);
  });

  it("distributes users across both variants", () => {
    const variants = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      variants.add(assignLucyVariant(`user-${i}`));
    }
    expect(variants.has("control_a")).toBe(true);
    expect(variants.has("treatment_b")).toBe(true);
  });
});

