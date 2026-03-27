# Roster Builder: Season-Locked Pokemon Indicator

**Date:** 2026-03-27
**Status:** Approved

## Overview

When users build a roster, show a visual badge on any Pokemon that is currently locked in an active season by any user. This lets users make informed decisions about which Pokemon are available league-wide before attempting to join a season.

## Background

The `seasonLockedPokemon` table tracks which Pokemon are locked per season. A composite primary key `(seasonId, pokemonId)` prevents the same Pokemon appearing twice in the same season. Pokemon become locked when a user joins a season (only possible during `registration` status) and unlocked when they leave — the leave route deletes the row from `seasonLockedPokemon`. There is no automatic cleanup on season completion; rows persist until explicitly removed. A Pokemon can be locked in multiple seasons simultaneously (one row per season).

When a user tries to join a season with an already-locked Pokemon, the join API returns a 409 with `takenPokemonIds`. The new indicator surfaces this information proactively during roster building.

## Design

### API Endpoint

**`GET /api/seasons/locked-pokemon`**

- File: `src/app/api/seasons/locked-pokemon/route.ts`
- Note: In Next.js App Router, static segments (`locked-pokemon`) take priority over dynamic segments (`[id]`) at the same directory level, so this route will correctly resolve before `[id]`.
- Use `import { db } from "@/lib/db"` — consistent with all other non-streaming season API routes (e.g., join, leave).
- Queries `seasonLockedPokemon` joined with `seasons` where `seasons.status IN ('registration', 'active', 'playoffs')`. Completed seasons are excluded because their locks are no longer relevant to active league competition (not because rows are automatically cleaned up — they aren't).
- Because the same Pokemon can be locked in multiple active seasons simultaneously, the query must deduplicate results. Use `db.selectDistinct({ pokemonId: seasonLockedPokemon.pokemonId }).from(seasonLockedPokemon).innerJoin(seasons, ...).where(inArray(seasons.status, [...]))`. Drizzle's `.selectDistinct()` is fully supported on PostgreSQL (the app uses `pgTable`).
- Returns `{ lockedPokemonIds: number[] }` — a typed `number[]` (matching the `integer` type of `pokemonId` in the schema). The response must be consumed as `number[]`, not `string[]`.
- No authentication required (public availability info)
- Include `Cache-Control: max-age=30` response header for browser-local caching — this is informational data that tolerates up to 30 seconds of staleness. Omit `public` to avoid CDN caches serving stale availability data to all users. This is a dynamic route handler (DB call); caching is provided solely by this header, not Next.js `revalidate`.
- Graceful: returns `{ lockedPokemonIds: [] }` on error

### RosterBuilder Changes

`src/app/components/RosterBuilder.tsx`

- Add a `useEffect` with an empty dependency array `[]` (runs once on mount) that fetches `GET /api/seasons/locked-pokemon`
- Parse response as `{ lockedPokemonIds: number[] }` and store in a `lockedPokemonIds: Set<number>` state variable (default: `new Set<number>()`)
- Fetch is fire-and-forget — no loading state, no error UI; if it fails the set stays empty and no badges appear
- Pass `isLockedInSeason={lockedPokemonIds.has(pokemon.id)}` to each `PokemonCard` in the selection grid. `pokemon.id` is `number`, matching the `Set<number>` type.

### PokemonCard Changes

`src/app/components/PokemonCard.tsx`

**Interface:** Add `isLockedInSeason?: boolean` to the `PokemonCardProps` interface (lines 19–26).

**Destructuring:** Add `isLockedInSeason = false` to the function parameter destructuring alongside the existing `allyBonus = false, rivalDebuff = false`.

**Badge:** When `isLockedInSeason && !isSelected`, render a badge in the **bottom-right corner**. The badge hides when the card is selected — this matches the ALLY/RIVAL behavior and is intentional. The badge is informational only, not blocking, and the user's selection state is the most visually prominent signal.

Corner layout:
- Top-left: ALLY badge (`absolute -top-2 -left-2`)
- Bottom-left: RIVAL badge (`absolute -bottom-2 -left-2`)
- Top-right: selection checkmark (`absolute -top-2 -right-2`)
- **Bottom-right: IN SEASON badge (new)** (`absolute -bottom-2 -right-2`)

Badge JSX (mirrors ALLY/RIVAL exactly):
```tsx
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

No `rounded` class — retro/pixel style is sharp-cornered throughout. Card remains fully selectable.

**Badge co-existence:** A Pokemon can simultaneously show the RIVAL badge (bottom-left) and the IN SEASON badge (bottom-right). These are on opposite corners and will not overlap. This is acceptable and expected behavior.

## Data Flow

```
RosterBuilder mounts
  → useEffect([]) fires
  → fetch GET /api/seasons/locked-pokemon
  → store Set<number> of locked Pokemon IDs
  → render PokemonCard grid
      → each card receives isLockedInSeason={lockedPokemonIds.has(pokemon.id)}
          → if true and not selected, render blue "IN SEASON" badge (absolute -bottom-2 -right-2)
```

## Files to Change

1. `src/app/api/seasons/locked-pokemon/route.ts` — new file, GET handler
2. `src/app/components/RosterBuilder.tsx` — fetch locked IDs on mount, pass to PokemonCard
3. `src/app/components/PokemonCard.tsx` — update `PokemonCardProps` interface, add prop to destructuring, add badge

## Out of Scope

- Differentiating which season(s) a Pokemon is locked in
- Showing which user locked a Pokemon
- Blocking selection of locked Pokemon (card remains selectable)
- Showing locked status anywhere outside the RosterBuilder (e.g., RosterDashboard, SeasonDetailPage)
