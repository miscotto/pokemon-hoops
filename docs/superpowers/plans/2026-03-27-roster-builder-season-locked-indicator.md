# Season-Locked Pokemon Indicator Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a blue "IN SEASON" badge on Pokemon cards in the roster builder when those Pokemon are locked in any active season by any user.

**Architecture:** A new unauthenticated GET endpoint queries `seasonLockedPokemon` joined with `seasons` and returns a deduplicated list of locked Pokemon IDs. `RosterBuilder` fetches this once on mount and stores it in a `Set<number>`, which is passed to each `PokemonCard` as the `isLockedInSeason` prop. `PokemonCard` renders a badge in the bottom-right corner using the same style as the existing ALLY/RIVAL badges.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM (PostgreSQL), TypeScript, React, Vitest, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-27-roster-builder-season-locked-indicator-design.md`

---

## Chunk 1: API Route

### Task 1: API Route — test + implementation

**Files:**
- Create: `src/app/api/seasons/locked-pokemon/route.ts`
- Create: `src/app/api/seasons/locked-pokemon/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/seasons/locked-pokemon/route.test.ts`:

```typescript
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

  it("returns deduplicated pokemon IDs as numbers", async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rajanrahman/CascadeProjects/windsurf-project-4
npx vitest run src/app/api/seasons/locked-pokemon/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

Create `src/app/api/seasons/locked-pokemon/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seasonLockedPokemon, seasons } from "@/lib/schema";
import { inArray, eq } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .selectDistinct({ pokemonId: seasonLockedPokemon.pokemonId })
      .from(seasonLockedPokemon)
      .innerJoin(seasons, eq(seasonLockedPokemon.seasonId, seasons.id))
      .where(inArray(seasons.status, ["registration", "active", "playoffs"]));

    const lockedPokemonIds = rows.map((r) => r.pokemonId);

    return NextResponse.json(
      { lockedPokemonIds },
      { headers: { "Cache-Control": "max-age=30" } }
    );
  } catch {
    return NextResponse.json({ lockedPokemonIds: [] });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/app/api/seasons/locked-pokemon/route.test.ts
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/app/api/seasons/locked-pokemon/route.ts src/app/api/seasons/locked-pokemon/route.test.ts
git commit -m "feat: add GET /api/seasons/locked-pokemon endpoint"
```

---

## Chunk 2: PokemonCard Badge

### Task 2: Add `isLockedInSeason` prop and "IN SEASON" badge to PokemonCard

No Vitest unit test — the Vitest config uses `environment: "node"` and only includes `.test.ts` (not `.test.tsx`), so React component tests are not supported. TypeScript compilation serves as the correctness check here.

**Files:**
- Modify: `src/app/components/PokemonCard.tsx:19-26` (interface)
- Modify: `src/app/components/PokemonCard.tsx:67-74` (destructuring)
- Modify: `src/app/components/PokemonCard.tsx:131-142` (after RIVAL badge)

- [ ] **Step 1: Add `isLockedInSeason` to the `PokemonCardProps` interface**

In `src/app/components/PokemonCard.tsx`, find this block (lines 19–26):

```typescript
interface PokemonCardProps {
  pokemon: Pokemon;
  onSelect: (pokemon: Pokemon) => void;
  isSelected: boolean;
  disabled: boolean;
  allyBonus?: boolean;
  rivalDebuff?: boolean;
}
```

Replace with:

```typescript
interface PokemonCardProps {
  pokemon: Pokemon;
  onSelect: (pokemon: Pokemon) => void;
  isSelected: boolean;
  disabled: boolean;
  allyBonus?: boolean;
  rivalDebuff?: boolean;
  isLockedInSeason?: boolean;
}
```

- [ ] **Step 2: Add `isLockedInSeason` to the function destructuring**

Find (lines 67–74):

```typescript
export default function PokemonCard({
  pokemon,
  onSelect,
  isSelected,
  disabled,
  allyBonus = false,
  rivalDebuff = false,
}: PokemonCardProps) {
```

Replace with:

```typescript
export default function PokemonCard({
  pokemon,
  onSelect,
  isSelected,
  disabled,
  allyBonus = false,
  rivalDebuff = false,
  isLockedInSeason = false,
}: PokemonCardProps) {
```

- [ ] **Step 3: Add the "IN SEASON" badge JSX after the RIVAL badge**

Find (lines 131–142):

```tsx
      {rivalDebuff && !isSelected && (
        <div
          className="absolute -bottom-2 -left-2 px-1 flex items-center justify-center border-2 font-pixel text-[5px] whitespace-nowrap"
          style={{
            backgroundColor: "#dc2626",
            borderColor: "#7f1d1d",
            color: "#fee2e2",
          }}
        >
          ⚔ RIVAL
        </div>
      )}
```

Replace with:

```tsx
      {rivalDebuff && !isSelected && (
        <div
          className="absolute -bottom-2 -left-2 px-1 flex items-center justify-center border-2 font-pixel text-[5px] whitespace-nowrap"
          style={{
            backgroundColor: "#dc2626",
            borderColor: "#7f1d1d",
            color: "#fee2e2",
          }}
        >
          ⚔ RIVAL
        </div>
      )}

      {isLockedInSeason && !isSelected && (
        <div
          className="absolute -bottom-2 -right-2 px-1 flex items-center justify-center border-2 font-pixel text-[5px] whitespace-nowrap"
          style={{
            backgroundColor: "#2563eb",
            borderColor: "#1e40af",
            color: "#dbeafe",
          }}
        >
          IN SEASON
        </div>
      )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/rajanrahman/CascadeProjects/windsurf-project-4
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to `PokemonCard.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/app/components/PokemonCard.tsx
git commit -m "feat: add IN SEASON badge to PokemonCard"
```

---

## Chunk 3: RosterBuilder Integration

### Task 3: Fetch locked IDs in RosterBuilder and pass to PokemonCard

**Files:**
- Modify: `src/app/components/RosterBuilder.tsx:84` (new state)
- Modify: `src/app/components/RosterBuilder.tsx` (new useEffect after existing ones)
- Modify: `src/app/components/RosterBuilder.tsx:1262-1282` (PokemonCard call site)

- [ ] **Step 1: Add `lockedPokemonIds` state**

In `src/app/components/RosterBuilder.tsx`, find (line 84):

```typescript
  const [mobileRosterOpen, setMobileRosterOpen] = useState(false);
```

Replace with:

```typescript
  const [mobileRosterOpen, setMobileRosterOpen] = useState(false);
  const [lockedPokemonIds, setLockedPokemonIds] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Add fetch useEffect**

Find the first `useEffect` in the file (around line 89):

```typescript
  // Load existing roster data from DB
  useEffect(() => {
```

Insert the following immediately before it:

```typescript
  // Fetch Pokemon locked in active seasons league-wide (fire-and-forget)
  useEffect(() => {
    fetch("/api/seasons/locked-pokemon")
      .then((res) => res.json())
      .then((data: { lockedPokemonIds: number[] }) => {
        setLockedPokemonIds(new Set(data.lockedPokemonIds));
      })
      .catch(() => {});
  }, []);

```

- [ ] **Step 3: Pass `isLockedInSeason` prop to PokemonCard**

Find (lines 1262–1282):

```tsx
              <PokemonCard
                key={pokemon.id}
                pokemon={pokemon}
                onSelect={handleSelect}
                isSelected={selectedIds.has(pokemon.id)}
                disabled={
                  filledCount >= 6 ||
                  (!selectedIds.has(pokemon.id) &&
                    teamSalary +
                      computeSalary(toBballAverages(pokemon), pokemon) >
                      SALARY_CAP)
                }
                allyBonus={
                  rosterPokemonNames.size > 0 &&
                  !!pokemon.allies?.some((a) => rosterPokemonNames.has(a))
                }
                rivalDebuff={
                  rosterPokemonNames.size > 0 &&
                  !!pokemon.rivals?.some((r) => rosterPokemonNames.has(r))
                }
              />
```

Replace with:

```tsx
              <PokemonCard
                key={pokemon.id}
                pokemon={pokemon}
                onSelect={handleSelect}
                isSelected={selectedIds.has(pokemon.id)}
                disabled={
                  filledCount >= 6 ||
                  (!selectedIds.has(pokemon.id) &&
                    teamSalary +
                      computeSalary(toBballAverages(pokemon), pokemon) >
                      SALARY_CAP)
                }
                allyBonus={
                  rosterPokemonNames.size > 0 &&
                  !!pokemon.allies?.some((a) => rosterPokemonNames.has(a))
                }
                rivalDebuff={
                  rosterPokemonNames.size > 0 &&
                  !!pokemon.rivals?.some((r) => rosterPokemonNames.has(r))
                }
                isLockedInSeason={lockedPokemonIds.has(pokemon.id)}
              />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/rajanrahman/CascadeProjects/windsurf-project-4
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (including the new route test from Chunk 1)

- [ ] **Step 6: Commit**

```bash
git add src/app/components/RosterBuilder.tsx
git commit -m "feat: show IN SEASON badge for league-locked Pokemon in roster builder"
```
