// src/app/api/tournaments/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { mockGetSession, mockCreateTournament } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCreateTournament: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@/lib/tournament-db", () => ({
  getAllTournaments: vi.fn().mockResolvedValue([]),
  createTournament: mockCreateTournament,
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/tournaments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTournament.mockResolvedValue("new-tournament-id");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 8 }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when name is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "", maxTeams: 8 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Tournament name is required" });
  });

  it("returns 400 when name is whitespace only", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "   ", maxTeams: 8 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Tournament name is required" });
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const longName = "a".repeat(101);
    const res = await POST(makeRequest({ name: longName, maxTeams: 8 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Tournament name must be 100 characters or fewer" });
  });

  it("returns 400 when maxTeams is not a valid power-of-2 size", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 6 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Team size must be 2, 4, 8, 16, or 32" });
  });

  it("returns 400 when maxTeams is not in allowed set", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Team size must be 2, 4, 8, 16, or 32" });
  });

  it("returns 400 when maxTeams is a float (e.g. 8.5)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Test Cup", maxTeams: 8.5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Team size must be 2, 4, 8, 16, or 32" });
  });

  it("creates tournament and returns 201 on valid input", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "  Test Cup  ", maxTeams: 8 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: "new-tournament-id",
      name: "Test Cup",
      maxTeams: 8,
      status: "waiting",
    });
    expect(mockCreateTournament).toHaveBeenCalledWith({
      name: "Test Cup",
      maxTeams: 8,
      createdBy: "u1",
    });
  });

  it("returns 400 when maxTeams is missing", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest({ name: "Test Cup" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Team size must be 2, 4, 8, 16, or 32" });
  });

  it("accepts all valid maxTeams values", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    for (const size of [2, 4, 8, 16, 32]) {
      vi.clearAllMocks();
      mockCreateTournament.mockResolvedValue("tid");
      mockGetSession.mockResolvedValue({ user: { id: "u1" } });
      const res = await POST(makeRequest({ name: "Cup", maxTeams: size }));
      expect(res.status).toBe(201);
    }
  });
});
