import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSession = vi.fn();
const mockListUsers = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      listUsers: mockListUsers,
    },
  },
}));

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUsers.mockResolvedValue({ users: [], total: 0 });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when user is not admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "user@test.com", role: "user" },
    });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns user list when admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "admin@test.com", role: "admin" },
    });
    mockListUsers.mockResolvedValue({
      users: [
        { id: "u1", name: "Admin", email: "admin@test.com" },
        { id: "u2", name: "Player", email: "player@test.com" },
      ],
      total: 2,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].email).toBe("admin@test.com");
    expect(mockListUsers).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 100 } })
    );
  });
});
