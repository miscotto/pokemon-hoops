import { describe, it, expect } from "vitest";
import { computeAbilityModifier } from "./abilityModifier";

describe("computeAbilityModifier", () => {
  it("returns 0 when all abilities are unknown", () => {
    expect(computeAbilityModifier(["FakeAbility", "NotReal"], ["AlsoFake"])).toBe(0);
  });

  it("adds +0.8 per self buff ability on own roster", () => {
    // "Technician" has edge type "self buff"
    expect(computeAbilityModifier(["Technician"], [])).toBe(0.8);
  });

  it("adds +1.5 per team buff ability on own roster", () => {
    // "Hadron Engine" has edge type "team buff"
    expect(computeAbilityModifier(["Hadron Engine"], [])).toBe(1.5);
  });

  it("subtracts 0.8 per enemy debuff on opponent roster", () => {
    // "Rough Skin" has edge type "enemy debuff"
    expect(computeAbilityModifier([], ["Rough Skin"])).toBe(-0.8);
  });

  it("subtracts 1.5 per enemy team debuff on opponent roster", () => {
    // "Pressure" has edge type "enemy team debuff"
    expect(computeAbilityModifier([], ["Pressure"])).toBe(-1.5);
  });

  it("caps positive contributions at +5.0", () => {
    // 4 × team buff (1.5 each) = 6.0, capped at 5.0
    const own = ["Hadron Engine", "Hadron Engine", "Hadron Engine", "Hadron Engine"];
    expect(computeAbilityModifier(own, [])).toBe(5.0);
  });

  it("floors negative contributions at -4.0", () => {
    // 4 × enemy team debuff (-1.5 each) = -6.0, floored at -4.0
    const opp = ["Pressure", "Pressure", "Pressure", "Pressure"];
    expect(computeAbilityModifier([], opp)).toBe(-4.0);
  });

  it("combines positive and negative without double-capping", () => {
    // +0.8 (self buff) + (-1.5 enemy team debuff) = -0.7
    expect(computeAbilityModifier(["Technician"], ["Pressure"])).toBeCloseTo(-0.7);
  });
});
