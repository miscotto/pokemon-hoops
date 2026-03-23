import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { mockGetSession, mockGetUser, mockSetUserPassword, mockRevokeUserSessions } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockSetUserPassword: vi.fn(),
  mockRevokeUserSessions: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      setUserPassword: mockSetUserPassword,
      revokeUserSessions: mockRevokeUserSessions,
    },
  },
}));

const makeRequest = (targetId: string) =>
  new NextRequest(`http://localhost/api/admin/users/${targetId}/reset-password`, {
    method: "POST",
  });

const makeParams = (id: string) => Promise.resolve({ id });

describe("POST /api/admin/users/[id]/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetUserPassword.mockResolvedValue({});
    mockRevokeUserSessions.mockResolvedValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when not admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "user" },
    });

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(401);
  });

  it("returns 400 when admin tries to reset their own password", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });

    const res = await POST(makeRequest("u1"), { params: makeParams("u1") });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Cannot reset your own password" });
  });

  it("returns 404 when target user does not exist", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue(null);

    const res = await POST(makeRequest("u99"), { params: makeParams("u99") });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "User not found" });
  });

  it("returns 500 when setUserPassword throws unexpectedly", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue({ id: "u2", email: "player@test.com" });
    mockSetUserPassword.mockRejectedValue(new Error("unexpected db error"));

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to reset password" });
  });

  it("returns tempPassword on success", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue({ id: "u2", email: "player@test.com" });

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tempPassword).toBe("string");
    expect(body.tempPassword.length).toBe(12);
  });

  it("returns tempPassword with warning when session revocation fails", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue({ id: "u2", email: "player@test.com" });
    mockRevokeUserSessions.mockRejectedValue(new Error("revoke failed"));

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tempPassword).toBe("string");
    expect(body.warning).toBe("Sessions could not be revoked");
  });
});
