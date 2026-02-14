import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => null)
}));

import { GET as getMatchesPreview } from "@/app/api/matches/preview/route";

describe("auth guard", () => {
  it("blocks protected matches route when unauthenticated", async () => {
    const response = await getMatchesPreview();
    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized");
  });
});
