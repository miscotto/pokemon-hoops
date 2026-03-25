// src/app/api/live-tournaments/[id]/fill-bots/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const {
  mockGetSession,
  mockGetTournament,
  mockGetTournamentTeamCount,
  mockGetTournamentTeams,
  mockJoinTournament,
  mockStartTournament,
  mockDbTransaction,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetTournament: vi.fn(),
  mockGetTournamentTeamCount: vi.fn(),
  mockGetTournamentTeams: vi.fn(),
  mockJoinTournament: vi.fn(),
  mockStartTournament: vi.fn(),
  mockDbTransaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@/lib/tournament-db", () => ({
  getTournament: mockGetTournament,
  getTournamentTeamCount: mockGetTournamentTeamCount,
  getTournamentTeams: mockGetTournamentTeams,
  joinTournament: mockJoinTournament,
  startTournament: mockStartTournament,
}));

vi.mock("@/lib/db", () => ({
  db: { transaction: mockDbTransaction },
}));

vi.mock("@/lib/pokemon-pool", () => ({
  loadPokemonPool: vi.fn(() => {
    const pool: Record<number, Record<string, unknown>> = {};
    for (let i = 1; i <= 20; i++) {
      pool[i] = {
        id: i,
        name: `pokemon-${i}`,
        sprite: `sprite-${i}.png`,
        types: ["fire"],
        stats: {},
        height: 10,
        weight: 50,
        ability: "blaze",
        rivals: [],
        allies: [],
        physicalProfile: {},
        bball: { ppg: 10, rpg: 5, apg: 3, per: 15 },
        playstyle: ["scorer"],
        salary: 1000000,
      };
    }
    return pool;
  }),
}));

function makeRequest(tournamentId: string) {
  return new NextRequest(
    `http://localhost/api/live-tournaments/${tournamentId}/fill-bots`,
    { method: "POST" }
  );
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const WAITING_TOURNAMENT = {
  id: "t1",
  name: "Test Cup",
  status: "waiting",
  max_teams: 4,
  created_at: new Date(),
  started_at: null,
  bracket_data: null,
  created_by: "user-1",
};

function makeMockRoster() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    name: `pokemon-${i + 1}`,
    sprite: `sprite-${i + 1}.png`,
    types: ["fire"],
    stats: {},
    height: 10,
    weight: 50,
    bball: { ppg: 10, rpg: 5, apg: 3, per: 15 },
  }));
}

const MOCK_TEAMS = [
  { id: "tt1", user_id: "user-1", roster_id: "r1", team_name: "Team A", roster_data: makeMockRoster(), joined_at: new Date() },
  { id: "tt2", user_id: "user-2", roster_id: "r2", team_name: "Team B", roster_data: makeMockRoster(), joined_at: new Date() },
];

// Helper: simulate the transaction executing its callback with a fake tx object.
function setupTransactionMock({
  liveCount,
  liveStatus,
}: { liveCount: number; liveStatus: string }) {
  mockDbTransaction.mockImplementation(
    async (cb: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([]) // advisory lock — no rows needed
        .mockResolvedValueOnce([{ count: liveCount, status: liveStatus }]); // count+status check
      return cb({ execute: mockExecute });
    }
  );
}

describe("POST /api/live-tournaments/[id]/fill-bots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJoinTournament.mockResolvedValue(undefined);
    mockStartTournament.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when tournament not found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tournament not found" });
  });

  it("returns 403 when caller is not the creator", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "other-user" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the tournament creator can fill with bots" });
  });

  it("returns 400 when tournament has already started (pre-check)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue({ ...WAITING_TOURNAMENT, status: "active" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tournament has already started" });
  });

  it("returns 400 when tournament is already full (pre-check)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT); // max_teams: 4
    mockGetTournamentTeamCount.mockResolvedValue(4);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tournament is already full" });
  });

  it("returns 400 when tournament was grabbed by a concurrent request (in-transaction check)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    mockGetTournamentTeamCount.mockResolvedValue(2);
    setupTransactionMock({ liveCount: 4, liveStatus: "active" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tournament no longer available" });
  });

  it("fills remaining slots with bots and starts tournament", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT); // max_teams: 4
    mockGetTournamentTeamCount.mockResolvedValue(2); // 2 real players, need 2 bots
    // Return all 4 teams (2 real + 2 bots) so seeding produces 2 matchups
    mockGetTournamentTeams.mockResolvedValue([
      ...MOCK_TEAMS,
      { id: "tt3", user_id: "bot_aaa", roster_id: "bot_aaa", team_name: "Pallet Charizards", roster_data: makeMockRoster(), joined_at: new Date() },
      { id: "tt4", user_id: "bot_bbb", roster_id: "bot_bbb", team_name: "Cerulean Arcanines", roster_data: makeMockRoster(), joined_at: new Date() },
    ]);
    setupTransactionMock({ liveCount: 2, liveStatus: "waiting" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("t1"), makeParams("t1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tournamentId: "t1", status: "active" });

    expect(mockJoinTournament).toHaveBeenCalledTimes(2);
    const [firstCall] = mockJoinTournament.mock.calls;
    expect(firstCall[0]).toBe("t1");
    expect(firstCall[1]).toMatch(/^bot_/);

    expect(mockStartTournament).toHaveBeenCalledTimes(1);
    const [tId, matchups, totalRounds] = mockStartTournament.mock.calls[0];
    expect(tId).toBe("t1");
    expect(matchups).toHaveLength(2); // 4 teams → 2 round-1 matchups
    expect(totalRounds).toBe(2);      // log2(4) = 2
  });

  it("bot team names follow '<City> <Mascot>' format", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue(WAITING_TOURNAMENT);
    mockGetTournamentTeamCount.mockResolvedValue(2);
    mockGetTournamentTeams.mockResolvedValue(MOCK_TEAMS);
    setupTransactionMock({ liveCount: 2, liveStatus: "waiting" });

    const { POST } = await import("./route");
    await POST(makeRequest("t1"), makeParams("t1"));

    const botNames = mockJoinTournament.mock.calls.map((c: unknown[]) => c[3] as string);
    for (const name of botNames) {
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+/);
    }
  });

  it("each bot roster has exactly 6 pokemon with correct slot labels", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetTournament.mockResolvedValue({ ...WAITING_TOURNAMENT, max_teams: 2 });
    mockGetTournamentTeamCount.mockResolvedValue(1);
    mockGetTournamentTeams.mockResolvedValue([MOCK_TEAMS[0]]);
    setupTransactionMock({ liveCount: 1, liveStatus: "waiting" });

    const { POST } = await import("./route");
    await POST(makeRequest("t1"), makeParams("t1"));

    const rosterData = mockJoinTournament.mock.calls[0][4] as Array<{ position: string }>;
    expect(rosterData).toHaveLength(6);
    expect(rosterData.map((p) => p.position)).toEqual(["PG", "SG", "SF", "PF", "C", "6MAN"]);
  });
});
