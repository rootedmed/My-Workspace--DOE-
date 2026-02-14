import { describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, getTrackByIdMock, advanceDecisionTrackMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getTrackByIdMock: vi.fn(),
  advanceDecisionTrackMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    getTrackById: getTrackByIdMock,
    advanceDecisionTrack: advanceDecisionTrackMock
  }
}));

vi.mock("@/lib/security/csrf", () => ({
  isValidCsrf: vi.fn(() => true)
}));

import { POST } from "@/app/api/decision-track/advance/route";

const baseTrack = {
  id: "track-1",
  state: "active_intro" as const,
  day: 1,
  reflectionCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  previousState: null
};

describe("POST /api/decision-track/advance authorization", () => {
  it("returns 404 for a track owned by another user", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1" });
    getTrackByIdMock.mockResolvedValueOnce({ ...baseTrack, id: "track-2", userId: "user-2" });

    const request = new Request("http://localhost/api/decision-track/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "track-2", action: "advance_day" })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Track not found");
    expect(advanceDecisionTrackMock).not.toHaveBeenCalled();
  });

  it("allows participant access to their own track", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1" });
    getTrackByIdMock.mockResolvedValueOnce({ ...baseTrack, userId: "user-1" });
    advanceDecisionTrackMock.mockResolvedValueOnce({
      track: { ...baseTrack, userId: "user-1", day: 2 },
      prompt: "Day 2 prompt"
    });

    const request = new Request("http://localhost/api/decision-track/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "track-1", action: "advance_day" })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.track.userId).toBe("user-1");
    expect(advanceDecisionTrackMock).toHaveBeenCalledWith("track-1", "advance_day");
  });
});
