# Ability Mechanics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `abilities.json` edge types into the game simulation so abilities influence who wins, and update both tooltip UIs to show trigger + effect text from the same source.

**Architecture:** Extract a pure `computeAbilityModifier` helper from the simulation engine so it can be unit-tested in isolation. The helper reads `abilities.json` edge types and returns a numeric modifier that feeds into `calculateTeamFactors`. UI changes are independent — both `AbilityBadge` components are updated to render a two-field tooltip (When / Effect) from `abilities.json`. Dead code in `supportAbilities.ts` is removed after the UI is migrated.

**Tech Stack:** Next.js 14, TypeScript, Vitest (unit tests), `public/abilities.json` (160 abilities, 4 edge types)

---

## Chunk 1: Simulation

### Task 1: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add test script)
- Create: `src/app/utils/abilityModifier.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

Expected: vitest added to `devDependencies` in `package.json`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In the `"scripts"` section, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Verify Vitest runs with no tests yet**

```bash
npm test
```

Expected output: `No test files found, exiting with code 1` — Vitest exits with code 1 when no files match. This is normal; proceed.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Extract and test `computeAbilityModifier`

This creates the pure helper function that the simulation will call. Testing it in isolation before wiring it in.

**Files:**
- Create: `src/app/utils/abilityModifier.ts`
- Create: `src/app/utils/abilityModifier.test.ts`

**Background — `abilities.json` edge types:**

| `edge type` | Who has it | Effect on current team |
|---|---|---|
| `self buff` | own roster player | +0.8 |
| `team buff` | own roster player | +1.5 |
| `enemy debuff` | opponent roster player | -0.8 |
| `enemy team debuff` | opponent roster player | -1.5 |

Positive contributions are capped at +5.0; negative contributions are floored at -4.0. These are summed to produce the final `abilityModifier`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/utils/abilityModifier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeAbilityModifier } from "./abilityModifier";

describe("computeAbilityModifier", () => {
  it("returns 0 when all abilities are unknown", () => {
    expect(computeAbilityModifier(["Overgrow", "Blaze"], ["Torrent"])).toBe(0);
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: `Cannot find module './abilityModifier'` — import fails. All tests fail.

- [ ] **Step 3: Verify edge types in `abilities.json` match test assumptions**

Before implementing, verify the abilities used in tests exist in `abilities.json` with the expected edge types:

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('./public/abilities.json','utf8'));
['Technician','Hadron Engine','Rough Skin','Pressure','Air Lock'].forEach(k => {
  console.log(k, d[k]?.['edge type'] ?? 'NOT FOUND');
});
"
```

Expected output (adjust test ability names if any say `NOT FOUND`):
```
Technician self buff
Hadron Engine team buff
Rough Skin enemy debuff
Pressure enemy team debuff
Air Lock enemy team debuff
```

If any ability says `NOT FOUND`, open `public/abilities.json`, find an ability with the required edge type, and update the test file to use that ability name before proceeding.

- [ ] **Step 4: Create `src/app/utils/abilityModifier.ts`**

```ts
import abilitiesData from "../../../public/abilities.json";

const SELF_BUFF_DELTA = 0.8;
const TEAM_BUFF_DELTA = 1.5;
const ENEMY_DEBUFF_DELTA = 0.8;
const ENEMY_TEAM_DEBUFF_DELTA = 1.5;
const MAX_BOOST = 5.0;
const MAX_PENALTY = 4.0;

/**
 * Computes the ability modifier for a team given their own abilities and the opponent's.
 * Positive contributions (own buffs) are capped at MAX_BOOST.
 * Negative contributions (opponent debuffs) are floored at -MAX_PENALTY.
 */
export function computeAbilityModifier(
  ownAbilities: string[],
  opponentAbilities: string[],
): number {
  let boost = 0;
  for (const ability of ownAbilities) {
    const edgeType = abilitiesData[ability]?.["edge type"];
    if (edgeType === "self buff") boost += SELF_BUFF_DELTA;
    else if (edgeType === "team buff") boost += TEAM_BUFF_DELTA;
  }
  boost = Math.min(boost, MAX_BOOST);

  let penalty = 0;
  for (const ability of opponentAbilities) {
    const edgeType = abilitiesData[ability]?.["edge type"];
    if (edgeType === "enemy debuff") penalty -= ENEMY_DEBUFF_DELTA;
    else if (edgeType === "enemy team debuff") penalty -= ENEMY_TEAM_DEBUFF_DELTA;
  }
  penalty = Math.max(penalty, -MAX_PENALTY);

  return boost + penalty;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test
```

Expected: `8 passed` (or adjusted count if you updated ability names in step 3). All green.

- [ ] **Step 6: Commit**

```bash
git add src/app/utils/abilityModifier.ts src/app/utils/abilityModifier.test.ts
git commit -m "feat: add computeAbilityModifier with unit tests"
```

---

### Task 3: Wire `computeAbilityModifier` into `calculateTeamFactors`

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts:261-317`

- [ ] **Step 1: Add imports at the top of `tournamentEngine.ts`**

Find the existing imports block (around line 1) and add both imports together:

```ts
import { computeAbilityModifier } from "./abilityModifier";
import abilitiesData from "../../../public/abilities.json";
```

`abilitiesData` is used in Task 4 for event descriptions — adding it here avoids a second import later.

- [ ] **Step 2: Add `abilityModifier` to the `TeamFactors` interface**

Find the `TeamFactors` interface (line ~261):

```ts
interface TeamFactors {
  teamBaseScore: number;
  headToHeadMatchup: number;
  clutchFatigue: number;
  finalRating: number;
  foulOutInjuryChance: number;
}
```

Replace with:

```ts
interface TeamFactors {
  teamBaseScore: number;
  headToHeadMatchup: number;
  clutchFatigue: number;
  abilityModifier: number;
  finalRating: number;
  foulOutInjuryChance: number;
}
```

- [ ] **Step 3: Update `calculateTeamFactors` to compute and return `abilityModifier`**

Find the bottom of `calculateTeamFactors` where `finalRating` is computed (line ~315):

```ts
  const finalRating = teamBaseScore + headToHeadMatchup + clutchFatigue;

  return { teamBaseScore, headToHeadMatchup, clutchFatigue, finalRating, foulOutInjuryChance };
```

Replace with:

```ts
  const abilityModifier = computeAbilityModifier(
    roster.map(p => p.ability ?? ""),
    opponent.roster.map(p => p.ability ?? ""),
  );

  const finalRating = teamBaseScore + headToHeadMatchup + clutchFatigue + abilityModifier;

  return { teamBaseScore, headToHeadMatchup, clutchFatigue, abilityModifier, finalRating, foulOutInjuryChance };
```

- [ ] **Step 4: Verify the build compiles**

```bash
npm run build
```

Expected: No TypeScript errors. Build succeeds.

- [ ] **Step 5: Smoke-test the simulation in the browser**

Run the dev server and play a game. Open browser console and verify no runtime errors. The simulation should still function normally.

```bash
npm run dev
```

Navigate to the roster builder, start a game, and confirm a match completes.

- [ ] **Step 6: Commit**

```bash
git add src/app/utils/tournamentEngine.ts
git commit -m "feat: wire ability modifiers into calculateTeamFactors"
```

---

### Task 4: Improve `ability_trigger` event descriptions

**Files:**
- Modify: `src/app/utils/tournamentEngine.ts` (~line 491–494)

- [ ] **Step 1: Update the `ability_trigger` event description**

Find this block (line ~491–494):

```ts
      } else if (sp < 0.80) {
        eventType = "ability_trigger";
        description = `${player.name}'s ability "${player.ability || "Pressure"}" activates!`;
        if (side === "home") homeMomentum += 2; else awayMomentum += 2;
```

Replace with:

```ts
      } else if (sp < 0.80) {
        eventType = "ability_trigger";
        const abilityName = player.ability || "Pressure";
        const abilityInfo = abilitiesData[abilityName];
        description = abilityInfo
          ? `${player.name}'s ${abilityName} activates — ${abilityInfo["effect desc"]}`
          : `${player.name}'s ability "${abilityName}" activates!`;
        if (side === "home") homeMomentum += 2; else awayMomentum += 2;
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 3: Smoke-test event descriptions**

Run the dev server, start a game, and watch the live feed. When an `ability_trigger` event appears for a Pokemon whose ability is in `abilities.json`, it should read:
> `Pikachu's Pressure activates — wears the other team down: opponents suffer -16%...`

For unknown abilities it still reads:
> `Bulbasaur's ability "Overgrow" activates!`

- [ ] **Step 4: Commit**

```bash
git add src/app/utils/tournamentEngine.ts
git commit -m "feat: show ability effect desc in game event feed"
```

---

## Chunk 2: UI + Cleanup

### Task 5: Update `PokemonCard.tsx` AbilityBadge

**Files:**
- Modify: `src/app/components/PokemonCard.tsx:22–59`

The current `AbilityBadge` shows only `effect desc` in a tooltip and falls back to `"Standard Pokemon ability"`. We need to show both **When** (`effect trigger`) and **Effect** (`effect desc`), with a consistent fallback.

- [ ] **Step 1: Replace the `AbilityBadge` function in `PokemonCard.tsx`**

Find the existing `AbilityBadge` function (lines 22–59) and replace it entirely. Note: the replacement intentionally removes the stray `c` class and `first-letter:uppercase` that appear in the existing tooltip `<span>` className.

```tsx
function AbilityBadge({ ability }: { ability: string }) {
  const [showTip, setShowTip] = useState(false);
  const abilityInfo = abilitiesData[ability];
  const trigger = abilityInfo?.["effect trigger"] ?? "No in-game effect";
  const desc = abilityInfo?.["effect desc"] ?? "No in-game effect";

  return (
    <span
      className="relative font-pixel text-[5px] leading-loose px-1.5 py-0.5 border cursor-help"
      style={{
        backgroundColor: "var(--color-surface-alt)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-muted)",
      }}
      onClick={(e) => {
        e.stopPropagation();
        setShowTip((v) => !v);
      }}
    >
      ✨ {ability}
      {showTip && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 text-[6px] font-pixel leading-loose text-center pointer-events-none border-2"
          style={{
            borderColor: "var(--color-shadow)",
            color: "var(--color-text)",
            boxShadow: "3px 3px 0 var(--color-shadow)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <span className="block font-bold">When:</span>{" "}
          {trigger}
          <span className="block font-bold mt-1">Effect:</span>{" "}
          {desc}
        </span>
      )}
    </span>
  );
}
```

Note: the `title={desc}` attribute on the `<span>` has been removed (the custom tooltip replaces it).

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 3: Visually verify the tooltip**

Run `npm run dev`. Open the Pokemon roster browser. Click any ability badge. The tooltip should show:

```
When: [effect trigger text]
Effect: [effect desc text]
```

Click a Pokemon whose ability is NOT in `abilities.json` (e.g. "Overgrow"). The tooltip should show:

```
When: No in-game effect
Effect: No in-game effect
```

- [ ] **Step 4: Commit**

```bash
git add src/app/components/PokemonCard.tsx
git commit -m "feat: show When + Effect fields in PokemonCard ability tooltip"
```

---

### Task 6: Update `RosterSlot.tsx` AbilityBadge

**Files:**
- Modify: `src/app/components/RosterSlot.tsx:1–70`

Currently imports from `SUPPORT_ABILITIES` (deprecated). We migrate to `abilities.json` and fix the `desc &&` guard that suppresses the tooltip for unknown abilities.

- [ ] **Step 1 & 2: Replace the import and `AbilityBadge` function in one edit**

> **Important:** Do Steps 1 and 2 together as a single edit. Replacing only the import in isolation will leave `SUPPORT_ABILITIES` referenced but undeclared and the build will fail. Apply both changes before running the build verification in Step 3.

Find line 12 in `RosterSlot.tsx`:

```ts
import { SUPPORT_ABILITIES } from "../utils/supportAbilities";
```

Replace with:

```ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const abilitiesData: Record<string, { "effect trigger": string; "effect desc": string }> =
  require("../../../public/abilities.json");
```

Then immediately find the existing `AbilityBadge` function (lines 27–76) and replace it:

```tsx
function AbilityBadge({ ability }: { ability: string }) {
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  const abilityInfo = abilitiesData[ability];
  const trigger = abilityInfo?.["effect trigger"] ?? "No in-game effect";
  const desc = abilityInfo?.["effect desc"] ?? "No in-game effect";

  return (
    <span
      className="font-pixel text-[5px] leading-loose px-1.5 py-0.5 border cursor-help"
      style={{
        backgroundColor: "var(--color-surface-alt)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-muted)",
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (tipPos) {
          setTipPos(null);
        } else {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setTipPos({ x: rect.left + rect.width / 2, y: rect.top });
        }
      }}
    >
      {ability}
      {tipPos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setTipPos(null)}
            />
            <span
              className="fixed z-50 w-44 p-2 text-[6px] font-pixel leading-loose text-center pointer-events-none border-2"
              style={{
                top: tipPos.y - 8,
                left: tipPos.x,
                transform: "translate(-50%, -100%)",
                backgroundColor: "var(--color-surface)",
                borderColor: "var(--color-shadow)",
                color: "var(--color-text)",
                boxShadow: "3px 3px 0 var(--color-shadow)",
              }}
            >
              <span className="block font-bold">When:</span>{" "}
              {trigger}
              <span className="block font-bold mt-1">Effect:</span>{" "}
              {desc}
            </span>
          </>,
          document.body
        )}
    </span>
  );
}
```

Key change from before: the `desc &&` guard is gone — the portal renders whenever `tipPos` is set.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: No TypeScript errors. If the build complains about unused imports, those will be cleaned up in Task 7.

- [ ] **Step 4: Visually verify roster slot tooltips**

Run `npm run dev`. Open the roster builder and add a Pokemon to a slot. Click the ability badge on a roster slot. The tooltip should show **When** and **Effect** fields, consistent with `PokemonCard`.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RosterSlot.tsx
git commit -m "feat: migrate RosterSlot ability tooltip to abilities.json"
```

---

### Task 7: Clean up `supportAbilities.ts`

**Files:**
- Modify: `src/app/utils/supportAbilities.ts`

Remove dead exports. The `SUPPORT_ABILITIES` import was the last consumer; after Task 6 it no longer exists in UI code.

- [ ] **Step 1: Confirm no remaining imports of `supportAbilities`**

```bash
grep -r "supportAbilities" src/ --include="*.ts" --include="*.tsx"
```

Expected: zero results. If any files still import from `supportAbilities`, fix them before proceeding.

- [ ] **Step 2: Delete `supportAbilities.ts`**

Since all exports are unused, remove the entire file and stage the deletion:

```bash
git rm src/app/utils/supportAbilities.ts
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: No errors. If any imports were missed in step 1, the build will flag them — fix those imports now.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All tests still pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove deprecated supportAbilities.ts"
```

---

## Done

All tasks complete. Verify success criteria from the spec:

1. **Ability modifier influences outcomes** — run `npm run dev`, start a game, open browser console. Add a `console.log(abilityModifier)` temporarily in `calculateTeamFactors` to confirm non-zero values for rosters with known abilities.

2. **Event feed shows effect desc** — watch a live game for `ability_trigger` events. Should read: `"Pikachu's Pressure activates — wears the other team down..."`.

3. **Tooltips show When + Effect** — click ability badges in both `PokemonCard` (roster browser) and `RosterSlot` (roster builder). Both show labeled **When** and **Effect** fields.

4. **Fallback works** — a Pokemon with an ability not in `abilities.json` still opens a tooltip showing `"No in-game effect"`.

5. **No `SUPPORT_ABILITIES` references** — `grep -r "SUPPORT_ABILITIES" src/` returns no results.
