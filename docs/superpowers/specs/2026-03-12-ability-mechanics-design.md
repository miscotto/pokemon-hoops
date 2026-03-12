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

`calculateTeamFactors(team, opponent, score, gameTimeSec, teamSide)` already receives both rosters. Extend it to compute an `abilityModifier` by iterating over each team's abilities and mapping `edge type` to a flat delta on `finalRating`.

### Edge Type → Modifier Mapping

| `edge type` | Direction | Delta |
|---|---|---|
| `self buff` | Boosts own team | +0.8 per player |
| `team buff` | Boosts own team | +1.5 per player |
| `enemy debuff` | Penalizes own team (from opponent roster) | -0.8 per opponent player |
| `enemy team debuff` | Penalizes own team (from opponent roster) | -1.5 per opponent player |

### Stacking Caps

- Max own boost from abilities: **+5.0**
- Max own penalty from opponent abilities: **-4.0**

These prevent support-heavy rosters from being dominantly overpowered.

### Fallback

Abilities not present in `abilities.json` contribute no modifier. Silent — no error.

### Formula Change

```
finalRating = teamBaseScore + headToHeadMatchup + clutchFatigue + abilityModifier
```

### Cleanup

Remove `computeAbilityEffects` from `supportAbilities.ts`. Remove any import of `SUPPORT_ABILITIES` from simulation code.

---

## Part 2 — Live Events: Meaningful Ability Descriptions

**File:** `src/app/utils/tournamentEngine.ts` (inside `generateGameEvents`)

### Current Behavior

When an `ability_trigger` event fires:
> *"Pikachu's ability 'Pressure' activates!"*

### New Behavior

Pull `effect trigger` and `effect desc` from `abilities.json` and compose:
> *"Pressure activates — wears the other team down: opponents suffer -16% to help rotations and -13% stamina efficiency late in possessions."*

Format: `"{ability name} activates — {effect desc}"`

### Fallback

If the ability is not in `abilities.json`, keep the current generic text unchanged.

---

## Part 3 — UI Text: Player Cards + Roster Slots

### Problem

Two `AbilityBadge` components exist with different data sources:

| Component | Current source | Issue |
|---|---|---|
| `PokemonCard.tsx` | `abilities.json` | Shows only `effect desc`; fallback is "Standard Pokemon ability" |
| `RosterSlot.tsx` | `SUPPORT_ABILITIES` (deprecated) | Wrong data source entirely |

### Fix

Both components read from `abilities.json`. The tooltip shows two fields:

- **When:** `effect trigger` (e.g. "Starts each defensive possession active")
- **Effect:** `effect desc` (e.g. "wears the other team down...")

### Fallback

Abilities not in `abilities.json` display: *"No in-game effect"* for both When and Effect.

---

## Files Changed

| File | Change |
|---|---|
| `src/app/utils/tournamentEngine.ts` | Add `abilityModifier` to `calculateTeamFactors`; improve `ability_trigger` event descriptions |
| `src/app/components/PokemonCard.tsx` | Update `AbilityBadge` tooltip to show trigger + effect; fix fallback text |
| `src/app/components/RosterSlot.tsx` | Switch `AbilityBadge` from `SUPPORT_ABILITIES` to `abilities.json` |
| `src/app/utils/supportAbilities.ts` | Remove `computeAbilityEffects`; keep `getSupportAbility` and `SupportAbilityDef` if still referenced |

---

## Success Criteria

- A team whose roster has more `team buff` / `self buff` abilities measurably scores higher on average
- `ability_trigger` game events show the ability's actual effect description
- Both `PokemonCard` and `RosterSlot` tooltips show consistent trigger + effect text from `abilities.json`
- No references to `SUPPORT_ABILITIES` remain in UI components
