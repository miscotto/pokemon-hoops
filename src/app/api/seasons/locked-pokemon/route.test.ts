// src/app/api/seasons/locked-pokemon/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelectDistinct } = vi.hoisted(() => ({
  mockSelectDistinct: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { selectDistinct: mockSelectDistinct },
}));

// Helper: set up the Drizzle fluent chain mock to resolve with `rows`
function setupDbMock(rows: { pokemonId: number }[]) {
  const mockWhere = vi.fn().mockResolvedValue(rows);
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelectDistinct.mockReturnValue({ from: mockFrom });
  return { mockFrom, mockInnerJoin, mockWhere };
}

describe("GET /api/seasons/locked-pokemon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no Pokemon are locked", async () => {
    setupDbMock([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ lockedPokemonIds: [] });
  });

  it("returns pokemon IDs as an array of numbers", async () => {
    setupDbMock([{ pokemonId: 6 }, { pokemonId: 25 }, { pokemonId: 150 }]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lockedPokemonIds).toEqual([6, 25, 150]);
    expect(body.lockedPokemonIds.every((id: unknown) => typeof id === "number")).toBe(true);
  });

  it("returns Cache-Control: max-age=30 header", async () => {
    setupDbMock([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("max-age=30");
  });

  it("returns empty array and 200 when db throws", async () => {
    const mockFrom = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("DB error")),
      }),
    });
    mockSelectDistinct.mockReturnValue({ from: mockFrom });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ lockedPokemonIds: [] });
  });
});
