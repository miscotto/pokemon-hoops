# Roster Builder: Season-Locked Pokemon Indicator

**Date:** 2026-03-27
**Status:** Approved

## Overview

When users build a roster, show a visual badge on any Pokemon that is currently locked in an active season by any user. This lets users make informed decisions about which Pokemon are available league-wide before attempting to join a season.

## Background

The `seasonLockedPokemon` table tracks which Pokemon are locked per season. A composite primary key `(seasonId, pokemonId)` prevents the same Pokemon appearing twice in the same season. Pokemon become locked when a user joins a season and unlocked when they leave. A Pokemon can be locked in multiple seasons simultaneously.

When a user tries to join a season with an already-locked Pokemon, the join API returns a 409 with `takenPokemonIds`. The new indicator surfaces this information proactively during roster building.

## Design

### API Endpoint

**`GET /api/seasons/locked-pokemon`**

- Queries `seasonLockedPokemon` joined with `seasons` where `seasons.status IN ('registration', 'active', 'playoffs')`
- Returns `{ lockedPokemonIds: number[] }` — flat array of Pokemon IDs locked in any non-completed season
- No authentication required (public availability info)
- Graceful: returns empty array on error

### RosterBuilder Changes

`src/app/components/RosterBuilder.tsx`

- On mount, fetch `GET /api/seasons/locked-pokemon`
- Store result in `lockedPokemonIds: Set<number>` state (empty set as default)
- Fetch is fire-and-forget — no loading state, no error UI; if it fails the set stays empty and no badges appear
- Pass `isLockedInSeason={lockedPokemonIds.has(pokemon.id)}` to each `PokemonCard` in the selection grid

### PokemonCard Changes

`src/app/components/PokemonCard.tsx`

- New optional prop: `isLockedInSeason?: boolean`
- When `true`, render a badge in the **bottom-right corner** (the only unused corner)
  - Top-left: ALLY badge
  - Bottom-left: RIVAL badge
  - Top-right: selection checkmark
  - **Bottom-right: IN SEASON badge (new)**
- Badge style:
  - Label: `IN SEASON`
  - Background: `#2563eb` (blue-600, matches season standings highlight in SeasonDetailPage)
  - Text: white, bold, small, rounded
  - Matches visual weight of existing ALLY/RIVAL badges
- Card remains fully selectable — badge is informational only

## Data Flow

```
RosterBuilder mounts
  → fetch GET /api/seasons/locked-pokemon
  → store Set<number> of locked Pokemon IDs
  → render PokemonCard grid
      → each card receives isLockedInSeason prop
          → if true, render blue "IN SEASON" badge (bottom-right)
```

## Files to Change

1. `src/app/api/seasons/locked-pokemon/route.ts` — new file, GET handler
2. `src/app/components/RosterBuilder.tsx` — fetch locked IDs, pass to PokemonCard
3. `src/app/components/PokemonCard.tsx` — new `isLockedInSeason` prop + badge

## Out of Scope

- Differentiating which season(s) a Pokemon is locked in
- Showing which user locked a Pokemon
- Blocking selection of locked Pokemon (card remains selectable)
- Showing locked status anywhere outside the RosterBuilder (e.g., RosterDashboard, SeasonDetailPage)
