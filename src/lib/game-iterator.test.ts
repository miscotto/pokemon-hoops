import { describe, it, expect } from "vitest";
import { createGameIterator } from "./game-iterator";
import type { TournamentTeam } from "../app/utils/tournamentEngine";

// Minimal team fixture — enough to run the iterator
function makeTeam(name: string): TournamentTeam {
  const pokemon = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    name: `Pokemon${i}`,
    sprite: "",
    types: ["normal"],
    stats: { hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45 },
    height: 7,
    weight: 69,
    bball: { ppg: 15, rpg: 5, apg: 4, spg: 1, bpg: 1, mpg: 30, per: 18 },
  }));
  return { id: name, name, coast: "west", seed: 1, isPlayer: false, roster: pokemon as TournamentTeam["roster"] };
}

describe("createGameIterator", () => {
  it("returns events until null (game ends)", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const events = [];
    let event;
    while ((event = iter.next()) !== null) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(10);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("game_end");
  });

  it("first event is game_start", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const first = iter.next();
    expect(first?.type).toBe("game_start");
  });

  it("events have monotonically increasing sequence", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const events = [];
    let event;
    while ((event = iter.next()) !== null) events.push(event);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].sequence).toBeGreaterThan(events[i - 1].sequence);
    }
  });

  it("final scores are not tied", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    let last;
    let event;
    while ((event = iter.next()) !== null) last = event;
    expect(last!.homeScore).not.toBe(last!.awayScore);
  });

  it("events include quarter_start events for Q2, Q3, Q4", () => {
    const iter = createGameIterator(makeTeam("Home"), makeTeam("Away"));
    const events = [];
    let event;
    while ((event = iter.next()) !== null) events.push(event);
    const quarterStarts = events.filter((e) => e.type === "quarter_start");
    expect(quarterStarts.length).toBe(3); // Q2, Q3, Q4
  });
});
