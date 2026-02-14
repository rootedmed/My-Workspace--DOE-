import { describe, expect, it } from "vitest";
import { transitionDecisionTrack } from "@/lib/decision-track/stateMachine";
import type { DecisionTrack } from "@/lib/domain/types";

function createTrack(): DecisionTrack {
  const now = new Date().toISOString();
  return {
    id: "track-1",
    userId: "user-1",
    state: "not_started",
    day: 0,
    reflectionCount: 0,
    createdAt: now,
    updatedAt: now,
    previousState: null
  };
}

describe("decision track state machine", () => {
  it("starts and advances through phase boundaries", () => {
    let track = transitionDecisionTrack(createTrack(), "start");
    expect(track.state).toBe("active_intro");
    expect(track.day).toBe(1);

    for (let i = 0; i < 3; i += 1) {
      track = transitionDecisionTrack(track, "advance_day");
    }
    expect(track.day).toBe(4);
    expect(track.state).toBe("active_values");

    for (let i = 0; i < 4; i += 1) {
      track = transitionDecisionTrack(track, "advance_day");
    }
    expect(track.day).toBe(8);
    expect(track.state).toBe("active_stress_test");
  });

  it("supports pause and resume", () => {
    let track = transitionDecisionTrack(createTrack(), "start");
    track = transitionDecisionTrack(track, "pause");
    expect(track.state).toBe("paused");
    track = transitionDecisionTrack(track, "resume");
    expect(track.state).toBe("active_intro");
  });
});
