import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/decision-track/route";

describe("POST /api/decision-track", () => {
  it("returns a 14-day track for valid input", async () => {
    const request = new Request("http://localhost/api/decision-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Maya",
        commitmentGoal: "long_term",
        weeklyDateCapacity: 3,
        decisionPace: "intentional",
        reflectionTrait: "direct communicator"
      })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.profile.firstName).toBe("Maya");
    expect(payload.track).toHaveLength(14);
    expect(payload.track[0].day).toBe(1);
    expect(payload.profile.decisionPace).toBe("intentional");
  });

  it("rejects invalid payloads", async () => {
    const request = new Request("http://localhost/api/decision-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "",
        commitmentGoal: "long_term",
        weeklyDateCapacity: 0,
        decisionPace: "intentional",
        reflectionTrait: ""
      })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Validation failed");
  });
});
