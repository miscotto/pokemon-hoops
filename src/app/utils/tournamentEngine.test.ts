import { describe, it, expect } from "vitest";
import { simulateMatchup } from "./tournamentEngine";
import type { TournamentTeam, TournamentPokemon } from "./tournamentEngine";

function makeTeam(id: string): TournamentTeam {
  const p: TournamentPokemon = {
    id: 1, name: "Testmon", sprite: "", types: ["fire"],
    stats: { hp: 100, attack: 100, defense: 100, specialAttack: 100, specialDefense: 100, speed: 100 },
    height: 10, weight: 100,
    bball: { ppg: 20, rpg: 5, apg: 5, spg: 2, bpg: 1, mpg: 30, per: 18 },
  };
  return { id, name: `Team ${id}`, coast: "west", seed: 1, isPlayer: false, roster: [p, p, p, p, p, p] };
}

describe("simulateMatchup — displayAtMs", () => {
  it("every event has a displayAtMs field", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    for (const e of result.events) {
      expect(typeof e.displayAtMs).toBe("number");
    }
  });

  it("no event has displayAtMs > 300_000", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    for (const e of result.events) {
      expect(e.displayAtMs).toBeLessThanOrEqual(300_000);
    }
  });

  it("events are in non-decreasing displayAtMs order", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].displayAtMs).toBeGreaterThanOrEqual(result.events[i - 1].displayAtMs);
    }
  });

  it("game_start event has displayAtMs === 0", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    const start = result.events.find(e => e.type === "game_start");
    expect(start?.displayAtMs).toBe(0);
  });

  it("game_end event has displayAtMs <= 300_000", () => {
    const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
    const end = result.events.find(e => e.type === "game_end");
    expect(end?.displayAtMs).toBeLessThanOrEqual(300_000);
  });

  it("consecutive non-scoring events after a steal have shorter gaps than slow narrative events", () => {
    let minGap = Infinity;
    let maxGap = 0;
    for (let i = 0; i < 5; i++) {
      const result = simulateMatchup(makeTeam("a"), makeTeam("b"));
      for (let j = 1; j < result.events.length; j++) {
        const gap = result.events[j].displayAtMs - result.events[j - 1].displayAtMs;
        if (gap > 0) {
          minGap = Math.min(minGap, gap);
          maxGap = Math.max(maxGap, gap);
        }
      }
    }
    expect(minGap).toBeLessThan(1500);
    expect(maxGap).toBeGreaterThanOrEqual(1500);
  });
});
