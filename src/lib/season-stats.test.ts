import { describe, it, expect } from "vitest";
import { shouldSkipGameEvent } from "./season-stats";

describe("shouldSkipGameEvent", () => {
  it("skips quarter_start events regardless of pokemonName", () => {
    expect(shouldSkipGameEvent("quarter_start", "Q2")).toBe(true);
  });
  it("skips quarter_end events", () => {
    expect(shouldSkipGameEvent("quarter_end", "Q4")).toBe(true);
  });
  it("skips halftime events", () => {
    expect(shouldSkipGameEvent("halftime", "Halftime")).toBe(true);
  });
  it("skips game_start events", () => {
    expect(shouldSkipGameEvent("game_start", "Tip-off")).toBe(true);
  });
  it("skips game_end events", () => {
    expect(shouldSkipGameEvent("game_end", "Final")).toBe(true);
  });
  it("does NOT skip scoring events with a real Pokemon name", () => {
    expect(shouldSkipGameEvent("score_2pt", "Pikachu")).toBe(false);
  });
  it("does NOT skip rebound events", () => {
    expect(shouldSkipGameEvent("rebound", "Snorlax")).toBe(false);
  });
  it("skips events with empty pokemonName (existing guard)", () => {
    expect(shouldSkipGameEvent("assist", "")).toBe(true);
  });
  it("skips events where pokemonName is Tip-off (existing guard)", () => {
    expect(shouldSkipGameEvent("score_2pt", "Tip-off")).toBe(true);
  });
});
