import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns service and database status", async () => {
    const response = await GET(new Request("http://localhost/api/health"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.app).toBe("ok");
    expect(payload.db).toBe("ok");
    expect(payload.service).toBe("commitment-match-mvp");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
