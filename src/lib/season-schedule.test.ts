import { describe, it, expect } from "vitest";
import { generateSeasonSchedule, type ScheduledGame } from "./season-schedule";

const makeTeams = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    userId: `user-${i}`,
    teamName: `Team ${i}`,
  }));

describe("generateSeasonSchedule", () => {
  it("generates C(n,2)*7 games for n teams", () => {
    const teams = makeTeams(16);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    const expected = ((16 * 15) / 2) * 7; // 840
    expect(games).toHaveLength(expected);
  });

  it("works for minimum 9 teams", () => {
    const teams = makeTeams(9);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    const expected = ((9 * 8) / 2) * 7; // 252
    expect(games).toHaveLength(expected);
  });

  it("each team pair appears exactly 7 times", () => {
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    const pairCounts: Record<string, number> = {};
    for (const g of games) {
      const key = [g.team1UserId, g.team2UserId].sort().join("|");
      pairCounts[key] = (pairCounts[key] ?? 0) + 1;
    }
    for (const count of Object.values(pairCounts)) {
      expect(count).toBe(7);
    }
  });

  it("scheduledAt is strictly increasing", () => {
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    for (let i = 1; i < games.length; i++) {
      expect(games[i].scheduledAt.getTime()).toBeGreaterThan(games[i - 1].scheduledAt.getTime());
    }
  });

  it("scheduledAt is within [start, end]", () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-05-01");
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, start, end);
    for (const g of games) {
      expect(g.scheduledAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(g.scheduledAt.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it("sweepNumber is 1-7 for all games", () => {
    const teams = makeTeams(4);
    const games = generateSeasonSchedule(teams, new Date("2026-04-01"), new Date("2026-05-01"));
    for (const g of games) {
      expect(g.sweepNumber).toBeGreaterThanOrEqual(1);
      expect(g.sweepNumber).toBeLessThanOrEqual(7);
    }
  });

  it("throws if fewer than 2 teams provided", () => {
    expect(() => generateSeasonSchedule(makeTeams(1), new Date("2026-04-01"), new Date("2026-05-01"))).toThrow();
  });

  it("throws if endDate is not after startDate", () => {
    const d = new Date("2026-04-01");
    expect(() => generateSeasonSchedule(makeTeams(9), d, d)).toThrow();
  });
});
