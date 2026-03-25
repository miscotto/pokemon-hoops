# Bot Fill Tournament — Design Spec
Date: 2026-03-24

## Problem

Tournament creators have to wait a long time for enough real players to join before their tournament starts. They need a way to fill remaining slots with generated bot teams on demand.

## Requirements

- Any tournament creator can fill all remaining open slots with bot teams
- Only the tournament creator can trigger bot fill (no one else)
- Bots fill ALL remaining slots at once, immediately starting the tournament
- Bot team names: `<PokemonCity> <PokemonMascot>s` (e.g. "Cerulean Charizards")
- Bot rosters: 6 pokemon sampled randomly from the existing augmented pool
- `createdBy` must be set correctly on implicitly-created tournaments (currently null)

## Out of Scope

- Partial bot fill (choosing how many bots)
- Bot difficulty settings
- Admins filling other users' tournaments with bots

---

## Architecture

### 1. Fix `createdBy` on implicit tournament creation

**File:** `src/app/api/live-tournaments/route.ts`

In the `POST` handler, when `createTournament()` is called as a fallback (no open tournament found), pass `createdBy: user.id`:

```ts
tournamentId = found ?? await createTournament({ createdBy: user.id });
```

This is a one-line fix. Admin-created tournaments already pass `createdBy` correctly.

---

### 2. New API endpoint: `POST /api/live-tournaments/[id]/fill-bots`

**File:** `src/app/api/live-tournaments/[id]/fill-bots/route.ts`

#### Auth & Preconditions

| Check | Failure response |
|---|---|
| Session missing | 401 Unauthorized |
| Tournament not found | 404 Not Found |
| `tournament.createdBy !== session.user.id` | 403 Forbidden |
| `tournament.status !== "waiting"` | 400 — "Tournament has already started" |
| `currentTeamCount >= maxTeams` | 400 — "Tournament is already full" |

#### Bot Generation

For each remaining slot (`remaining = maxTeams - currentTeamCount`):

1. **userId**: `bot_<uuidv4()>` — guaranteed never to match a real user
2. **teamName**: sampled from two hardcoded lists without replacement where possible:
   - Cities: Pallet, Cerulean, Vermilion, Lavender, Celadon, Fuchsia, Saffron, Cinnabar, Viridian, Pewter, Goldenrod, Ecruteak, Olivine, Mahogany, Blackthorn, Azalea
   - Mascots: Charizards, Arcanines, Gengars, Machamps, Alakazams, Gyaradoses, Snorlaxes, Electrodes, Nidokings, Tauros, Rhydons, Onixes
   - Combined: `"${city} ${mascot}"` — shuffle both lists, pair by index, avoid duplicates within the same tournament
3. **rosterData**: 6 pokemon sampled randomly without replacement from the augmented pool (`pokemon-bball-stats-augmented.json`), assigned to slots `["PG", "SG", "SF", "PF", "C", "6MAN"]` in order. Each entry uses the same shape as real roster entries (id, name, sprite, types, stats, height, weight, ability, rivals, allies, physicalProfile, bball, playstyle, salary).

#### Flow

1. Compute `remaining = maxTeams - currentTeamCount`
2. Load pokemon pool (already cached in module scope in the join route — reuse `loadPokemonPool()`)
3. Generate `remaining` bot team objects
4. Insert each bot via `joinTournament(tournamentId, botUserId, botUserId, teamName, rosterData)` — uses `botUserId` for both `userId` and `rosterId` since bots have no real roster row
5. After all bots inserted, run the same seeding + start logic as the join route:
   - Fetch all teams, rank by power, pair seeds
   - Call `startTournament(tournamentId, round1Matchups, totalRounds)`
6. Return `{ tournamentId, status: "active" }`

---

### 3. Expose `isCreator` from `GET /api/live-tournaments/[id]`

**File:** `src/app/api/live-tournaments/[id]/route.ts`

Add `isCreator: tournament.createdBy === session?.user?.id` to the response object. This field is only `true` when the current user created the tournament. Unauthenticated users receive `false`.

---

### 4. UI — Waiting Lobby button

**File:** `src/app/tournaments/[id]/page.tsx`

In the waiting lobby section, add a "FILL WITH BOTS" button:

- **Visible when**: `tournament.status === "waiting"` AND `tournament.isCreator === true` AND `(tournament.teamCount ?? 0) < tournament.maxTeams`
- **Position**: below the team list, above or alongside the "LEAVE TOURNAMENT" button
- **Variant**: `PokeButton variant="primary"`
- **Loading state**: "FILLING..." while request is in flight
- **On success**: re-fetch tournament state (bracket renders automatically)
- **On error**: show inline error message using existing error state

#### Type update

Add `isCreator?: boolean` to the `TournamentState` interface.

---

## Data Flow

```
Creator clicks "FILL WITH BOTS"
  → POST /api/live-tournaments/[id]/fill-bots
    → verify creator
    → generate bot teams
    → joinTournament() × N
    → startTournament()
  → response: { status: "active" }
  → client re-fetches GET /api/live-tournaments/[id]
  → bracket renders
```

---

## Error Handling

- All bot inserts use the existing `joinTournament()` which has `onConflictDoNothing()` — safe against retries
- `startTournament()` is idempotent if called twice (second call updates an already-active tournament, which is a no-op due to the `status = 'active'` condition on the update)
- If bot name collision occurs (all city/mascot combos exhausted), fall back to `Bot Team ${i+1}`

---

## Testing Considerations

- Unit: bot name generator produces valid names, no duplicates within a batch
- Unit: bot roster generation always returns exactly 6 pokemon with correct slot labels
- Integration: `POST /fill-bots` returns 403 for non-creator, 400 for already-started tournament
- Integration: after fill-bots, tournament status becomes "active" and team count equals maxTeams
