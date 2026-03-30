import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSeasonGamesFiltered } = vi.hoisted(() => ({
  mockGetSeasonGamesFiltered: vi.fn(),
}));

vi.mock("@/lib/season-db", () => ({
  getSeasonGamesFiltered: mockGetSeasonGamesFiltered,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    },
  },
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({}) }));

const SEASON_ID = "season-abc";
const FAKE_GAMES = [{ id: "game-1", status: "pending" }];

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/seasons/${SEASON_ID}/games`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("GET /api/seasons/[id]/games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSeasonGamesFiltered.mockResolvedValue(FAKE_GAMES);
  });

  it("returns 401 when not authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest() as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(res.status).toBe(401);
  });

  it("maps status=live to in_progress", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ status: "live" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ status: "in_progress" })
    );
  });

  it("maps status=upcoming to pending", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ status: "upcoming" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ status: "pending" })
    );
  });

  it("maps status=completed to completed", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ status: "completed" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ status: "completed" })
    );
  });

  it("passes userId filter", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ userId: "user-99" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ userId: "user-99" })
    );
  });

  it("passes limit and offset as numbers", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ limit: "25", offset: "50" }) as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(mockGetSeasonGamesFiltered).toHaveBeenCalledWith(
      SEASON_ID,
      expect.objectContaining({ limit: 25, offset: 50 })
    );
  });

  it("returns 200 with games array", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest() as never, { params: Promise.resolve({ id: SEASON_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(FAKE_GAMES);
  });
});
