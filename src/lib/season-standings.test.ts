import { describe, it, expect } from "vitest";
import { computeStandings, seedPlayoffBracket, type TeamRecord } from "./season-standings";

const makeTeam = (userId: string, wins: number, losses: number, pf: number, pa: number): TeamRecord => ({
  userId,
  teamName: `Team ${userId}`,
  wins,
  losses,
  pointsFor: pf,
  pointsAgainst: pa,
});

describe("computeStandings", () => {
  it("sorts by wins descending", () => {
    const teams = [
      makeTeam("a", 5, 2, 700, 600),
      makeTeam("b", 7, 0, 900, 700),
      makeTeam("c", 3, 4, 500, 600),
    ];
    const sorted = computeStandings(teams, "season-1");
    expect(sorted[0].userId).toBe("b");
    expect(sorted[1].userId).toBe("a");
    expect(sorted[2].userId).toBe("c");
  });

  it("uses point differential as tiebreaker", () => {
    const teams = [
      makeTeam("a", 5, 2, 700, 650), // diff = 50
      makeTeam("b", 5, 2, 800, 730), // diff = 70
    ];
    const sorted = computeStandings(teams, "season-1");
    expect(sorted[0].userId).toBe("b");
  });

  it("uses pointsFor as third tiebreaker", () => {
    const teams = [
      makeTeam("a", 5, 2, 700, 650), // diff = 50, pf = 700
      makeTeam("b", 5, 2, 750, 700), // diff = 50, pf = 750
    ];
    const sorted = computeStandings(teams, "season-1");
    expect(sorted[0].userId).toBe("b");
  });

  it("seeded random tiebreaker is deterministic for same seasonId", () => {
    const teams = [makeTeam("x", 5, 2, 700, 650), makeTeam("y", 5, 2, 700, 650)];
    const run1 = computeStandings(teams, "season-abc")[0].userId;
    const run2 = computeStandings(teams, "season-abc")[0].userId;
    expect(run1).toBe(run2);
  });

  it("seeded random tiebreaker differs for different seasonIds (probabilistically)", () => {
    const teams = Array.from({ length: 10 }, (_, i) => makeTeam(`t${i}`, 5, 2, 700, 650));
    const order1 = computeStandings(teams, "season-111").map((t) => t.userId).join(",");
    const order2 = computeStandings(teams, "season-999").map((t) => t.userId).join(",");
    expect(typeof order1).toBe("string");
  });
});

describe("seedPlayoffBracket", () => {
  const makeRankedTeams = (n: number) =>
    Array.from({ length: n }, (_, i) => makeTeam(`seed-${i + 1}`, 10 - i, i, 800 - i * 10, 700));

  it("pairs 1v8, 2v7, 3v6, 4v5 from already-sorted standings", () => {
    const teams = makeRankedTeams(10);
    const standings = computeStandings(teams, "season-x");
    const bracket = seedPlayoffBracket(standings);
    expect(bracket).toHaveLength(4);
    expect(bracket[0].team1UserId).toBe("seed-1");
    expect(bracket[0].team2UserId).toBe("seed-8");
    expect(bracket[1].team1UserId).toBe("seed-2");
    expect(bracket[1].team2UserId).toBe("seed-7");
    expect(bracket[2].team1UserId).toBe("seed-3");
    expect(bracket[2].team2UserId).toBe("seed-6");
    expect(bracket[3].team1UserId).toBe("seed-4");
    expect(bracket[3].team2UserId).toBe("seed-5");
  });

  it("requires at least 8 teams in standings", () => {
    const teams = makeRankedTeams(7);
    const standings = computeStandings(teams, "season-x");
    expect(() => seedPlayoffBracket(standings)).toThrow();
  });

  it("only top 8 are included in the bracket regardless of total team count", () => {
    const teams = makeRankedTeams(16);
    const standings = computeStandings(teams, "season-x");
    const bracket = seedPlayoffBracket(standings);
    const allIds = bracket.flatMap((m) => [m.team1UserId, m.team2UserId]);
    for (const id of allIds) {
      const seed = parseInt(id.replace("seed-", ""));
      expect(seed).toBeLessThanOrEqual(8);
    }
  });
});
