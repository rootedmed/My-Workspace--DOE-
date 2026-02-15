import { describe, expect, it, vi } from "vitest";

const { uploadMock, upsertMock, createServerSupabaseClientMock } = vi.hoisted(() => {
  const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  const eq = vi.fn(() => ({ eq, maybeSingle }));
  const select = vi.fn(() => ({ eq, maybeSingle, order: vi.fn(() => ({ data: [], error: null })) }));

  const single = vi.fn(async () => ({
    data: {
      id: "photo-1",
      slot: 1,
      mime_type: "image/png",
      storage_path: "user-1/generated.png",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    error: null
  }));

  const upsert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
  const from = vi.fn(() => ({ select, upsert }));

  const upload = vi.fn(async () => ({ data: { path: "user-1/generated.png" }, error: null }));
  const signedUrl = vi.fn(async () => ({ data: { signedUrl: "https://example.com/signed" }, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const storageFrom = vi.fn(() => ({ upload, createSignedUrl: signedUrl, remove }));

  return {
    uploadMock: upload,
    upsertMock: upsert,
    createServerSupabaseClientMock: vi.fn(async () => ({ from, storage: { from: storageFrom } }))
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", email: "maya@example.com", firstName: "Maya" }))
}));

vi.mock("@/lib/auth/ensureAppUser", () => ({
  ensureAppUser: vi.fn(async () => undefined)
}));

vi.mock("@/lib/security/csrf", () => ({
  isValidCsrf: vi.fn(() => true)
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

import { POST } from "@/app/api/photos/route";

describe("POST /api/photos", () => {
  it("uploads to storage under user scoped path and writes metadata", async () => {
    const file = {
      size: 6,
      type: "image/png",
      arrayBuffer: async () => new TextEncoder().encode("binary").buffer
    } as unknown as File;
    const formData = {
      get: (key: string) => {
        if (key === "slot") {
          return "1";
        }
        if (key === "file") {
          return file;
        }
        return null;
      }
    } as unknown as FormData;

    const request = {
      headers: new Headers({ "x-csrf-token": "csrf" }),
      formData: async () => formData
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(uploadMock).toHaveBeenCalled();

    const uploadPath = String((uploadMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] ?? "");
    expect(uploadPath.startsWith("user-1/")).toBe(true);
    expect(upsertMock).toHaveBeenCalled();
  });
});
