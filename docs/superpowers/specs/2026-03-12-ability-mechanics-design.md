# Ability Mechanics & UX — Design Spec
**Date:** 2026-03-12

## Problem

Pokemon abilities are assigned to every roster member but have zero influence on game outcomes. The deprecated `computeAbilityEffects` function in `supportAbilities.ts` was the intended mechanism but is never called. Additionally, `RosterSlot.tsx` reads ability descriptions from the deprecated `SUPPORT_ABILITIES` map rather than `abilities.json`, creating two inconsistent sources of truth. Users cannot understand what abilities do or trust that they matter.

## Goals

1. Make abilities mechanically meaningful — they must influence who wins games
2. Unify ability data — `abilities.json` is the single source of truth
3. Communicate abilities clearly — player cards and live game events both surface ability context

## Out of Scope

- Custom trigger logic per individual ability (160 abilities × unique triggers)
- Modifying `abilities.json` content
- Support Pokemon ability system (`supportAbilities.ts`) — deprecated and removed

---

## Part 1 — Simulation: Wire `abilities.json` into `calculateTeamFactors`

**File:** `src/app/utils/tournamentEngine.ts`

### Approach

`calculateTeamFactors(team, opponent, score, gameTimeSec, teamSide)` already receives both rosters. Extend it to compute an `abilityModifier` by:

1. Iterating over **`team.roster`** and summing positive deltas for `self buff` and `team buff` abilities
2. Iterating over **`opponent.roster`** and summing negative deltas for `enemy debuff` and `enemy team debuff` abilities (these abilities on the opponent penalize the current team being calculated)

Both sums contribute to the **current team's** `abilityModifier`. The function already computes each team's factors independently in two separate calls, so no cross-contamination occurs.

### Edge Type → Modifier Mapping

| `edge type` | Iterated roster | Delta to current team's `abilityModifier` |
|---|---|---|
| `self buff` | `team.roster` | +0.8 per player with this edge type |
| `team buff` | `team.roster` | +1.5 per player with this edge type |
| `enemy debuff` | `opponent.roster` | -0.8 per opponent player with this edge type |
| `enemy team debuff` | `opponent.roster` | -1.5 per opponent player with this edge type |

**Example:** Team A has 2 players with `team buff` (+3.0) and 1 with `self buff` (+0.8). Team B (opponent) has 1 player with `enemy team debuff` (-1.5). Team A's `abilityModifier` = +3.0 + 0.8 - 1.5 = **+2.3**.

### Stacking Caps

Apply caps after summing:

- Positive component (from own roster): capped at **+5.0**
- Negative component (from opponent roster): floored at **-4.0**

Cap the two components separately before combining, so a team cannot exceed +5.0 even with 6 `team buff` players, and cannot suffer worse than -4.0 even against a fully debuff-stacked opponent.

The buff cap (+5.0) is intentionally higher than the debuff floor (-4.0) because buff abilities (106 + 27) vastly outnumber debuff abilities (17 + 10) in `abilities.json`. This asymmetry reflects the data distribution rather than privileging offense over defense.

### `TeamFactors` Interface

Add `abilityModifier: number` as a named field on the `TeamFactors` interface so callers can inspect breakdown stats for debugging:

```ts
interface TeamFactors {
  teamBaseScore: number;
  headToHeadMatchup: number;
  clutchFatigue: number;
  abilityModifier: number;  // new
  finalRating: number;
  foulOutInjuryChance: number;
}
```

### Formula Change

```
finalRating = teamBaseScore + headToHeadMatchup + clutchFatigue + abilityModifier
```

### Fallback

Abilities not present in `abilities.json` contribute 0 to `abilityModifier`. Silent — no error.

### Data Loading

Import `abilities.json` at the top of `tournamentEngine.ts` as a module-level constant:

```ts
import abilitiesData from "../../../public/abilities.json";
```

This is consistent with how `PokemonCard.tsx` already loads it. No async fetch needed.

### `supportAbilities.ts` Cleanup

- **Remove:** `computeAbilityEffects` (deprecated, no callers)
- **Remove:** `supportOverloadPenalty` (no callers anywhere in the codebase)
- **Remove:** `getSupportAbility` (no callers in `src/` — note: `scripts/buildAllStats.ts` and `scripts/addAbilities.ts` contain their own standalone copies of this logic and do not import from `supportAbilities.ts`, so removal is safe and does not affect those scripts)
- **Keep:** `SupportAbilityDef` and `SUPPORT_ABILITIES` only if any remaining component still imports them after the UI fix in Part 3 — otherwise remove entirely

---

## Part 2 — Live Events: Meaningful Ability Descriptions

**File:** `src/app/utils/tournamentEngine.ts` (inside `generateGameEvents`)

### Current Behavior

When an `ability_trigger` event fires (line ~493):
```ts
description = `${player.name}'s ability "${player.ability || "Pressure"}" activates!`;
```

### New Behavior

When the player's ability exists in `abilities.json`, compose:
```ts
description = `${player.name}'s ${player.ability} activates — ${abilityInfo["effect desc"]}`;
```

**Example:** `"Pikachu's Pressure activates — wears the other team down: opponents suffer -16% to help rotations and -13% stamina efficiency late in possessions."`

The player name prefix is retained so the game feed stays attributable to a specific player.

### Fallback

If the ability is not in `abilities.json` (242 of 1025 Pokemon), keep the current generic text:
```ts
description = `${player.name}'s ability "${player.ability || "Pressure"}" activates!`;
```

---

## Part 3 — UI Text: Player Cards + Roster Slots

### Problem

Two `AbilityBadge` components exist with different data sources:

| Component | Current source | Issue |
|---|---|---|
| `PokemonCard.tsx` | `abilities.json` | Shows only `effect desc`; fallback is "Standard Pokemon ability" |
| `RosterSlot.tsx` | `SUPPORT_ABILITIES` (deprecated) | Wrong data source entirely; tooltip conditionally hidden when `desc` is falsy |

### Fix

Both components read from `abilities.json` via a module-level import (same pattern as `PokemonCard.tsx`). Extract a shared utility or duplicate the import — either is acceptable; a shared `getAbilityInfo(ability: string)` helper avoids the duplication.

The tooltip shows two fields:

- **When:** `effect trigger` (e.g. "Starts each defensive possession active")
- **Effect:** `effect desc` (e.g. "wears the other team down...")

### Fallback

For abilities not in `abilities.json`, both `PokemonCard.tsx` and `RosterSlot.tsx` show:
- **When:** `"No in-game effect"`
- **Effect:** `"No in-game effect"`

This replaces `PokemonCard.tsx`'s current `"Standard Pokemon ability"` fallback and makes both components consistent.

**Important:** The tooltip must render for all abilities, not only when `desc` is truthy. Remove the `desc &&` guard in `RosterSlot.tsx` and replace with the fallback string so the tooltip always opens.

---

## Files Changed

| File | Change |
|---|---|
| `src/app/utils/tournamentEngine.ts` | Add `abilityModifier` to `TeamFactors` and `calculateTeamFactors`; improve `ability_trigger` event descriptions; import `abilities.json` |
| `src/app/components/PokemonCard.tsx` | Update `AbilityBadge` tooltip to show trigger + effect; fix fallback text |
| `src/app/components/RosterSlot.tsx` | Switch `AbilityBadge` from `SUPPORT_ABILITIES` to `abilities.json`; remove `desc &&` guard; show fallback for unknown abilities |
| `src/app/utils/supportAbilities.ts` | Remove `computeAbilityEffects`, `supportOverloadPenalty`, `getSupportAbility`; remove entire file if nothing remains referenced |

---

## Success Criteria

- A team whose roster has more `team buff` / `self buff` abilities measurably scores higher `finalRating` than an equivalent team without them (verifiable by logging `abilityModifier` in dev)
- `ability_trigger` game events show `${player.name}'s ${ability} activates — ${effect desc}` for abilities in `abilities.json`
- Both `PokemonCard` and `RosterSlot` tooltips show a labeled **When** row populated from `effect trigger` and a labeled **Effect** row from `effect desc` for abilities in `abilities.json`
- Tooltips open for all abilities, including those not in `abilities.json` (showing "No in-game effect" for both When and Effect)
- No references to `SUPPORT_ABILITIES` remain in UI components
