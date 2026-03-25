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

Admin-created tournaments already pass `createdBy` correctly. This is a one-line fix.

---

### 2. Update `getTournament()` to return `createdBy`

**File:** `src/lib/tournament-db.ts`

The `getTournament` function currently does not include `createdBy` in its return shape. Add it:

```ts
return {
  id: r.id,
  name: r.name,
  status: r.status,
  max_teams: r.maxTeams,
  created_at: r.createdAt,
  started_at: r.startedAt ?? null,
  bracket_data: r.bracketData,
  created_by: r.createdBy ?? null,   // ← add this
};
```

This is required for the `fill-bots` auth check and for the `isCreator` field on the GET response.

---

### 3. New API endpoint: `POST /api/live-tournaments/[id]/fill-bots`

**File:** `src/app/api/live-tournaments/[id]/fill-bots/route.ts`

Only export `POST`. Next.js App Router returns 405 for other methods automatically.

#### Auth & Preconditions

| Check | Failure response |
|---|---|
| Session missing | 401 Unauthorized |
| Tournament not found | 404 Not Found |
| `tournament.created_by !== session.user.id` | 403 Forbidden |
| `tournament.status !== "waiting"` | 400 — "Tournament has already started" |
| `currentTeamCount >= maxTeams` | 400 — "Tournament is already full" |

#### Concurrency Protection

The bot insert + start sequence must be wrapped in a Postgres transaction with an advisory lock on `tournamentId` (same pattern as `tryAdvanceRound`). This prevents two simultaneous requests (double-tap, or a bot fill racing a real user join) from inserting more teams than `maxTeams` or calling `startTournament` twice.

Within the transaction:
1. Re-fetch the current team count
2. If `currentCount >= maxTeams` or `status !== "waiting"`, abort (return 400)
3. Insert bots
4. Call `startTournament`

This ensures `startTournament` is never called on an already-active tournament, removing any need for idempotency from it.

#### Bot Generation

For each remaining slot (`remaining = maxTeams - currentTeamCount`):

1. **userId**: `bot_<uuidv4()>` — guaranteed never to match a real user
2. **teamName**: sampled from two hardcoded lists, shuffled, paired by index:
   - Cities: Pallet, Cerulean, Vermilion, Lavender, Celadon, Fuchsia, Saffron, Cinnabar, Viridian, Pewter, Goldenrod, Ecruteak, Olivine, Mahogany, Blackthorn, Azalea
   - Mascots: Charizards, Arcanines, Gengars, Machamps, Alakazams, Gyaradoses, Snorlaxes, Electrodes, Nidokings, Tauros, Rhydons, Onixes
   - Combined: `"${city} ${mascot}"` — shuffle both lists, pair by index, avoid duplicates within the same tournament
   - Fallback (all combos exhausted): `"Bot Team ${uuidv4().slice(0, 6)}"` — uses a UUID fragment for uniqueness rather than a sequential index
3. **rosterData**: 6 pokemon sampled randomly without replacement from the augmented pool (`pokemon-bball-stats-augmented.json`), assigned to slots `["PG", "SG", "SF", "PF", "C", "6MAN"]` in order. Each entry uses the same shape as real roster entries (id, name, sprite, types, stats, height, weight, ability, rivals, allies, physicalProfile, bball, playstyle, salary).

#### Flow

1. Begin Postgres transaction with advisory lock on tournament
2. Re-fetch team count and tournament status inside transaction
3. Abort if status !== "waiting" or count >= maxTeams
4. Load pokemon pool via `loadPokemonPool()` (reuse from existing module)
5. Generate `remaining` bot team objects
6. Insert each bot via `joinTournament()` inside the transaction
7. Run seeding + start logic (same as join route):
   - Fetch all teams, rank by power, pair seeds
   - Call `startTournament(tournamentId, round1Matchups, totalRounds)` inside the transaction
8. Commit
9. Return `{ tournamentId, status: "active" }`

---

### 4. Update `GET /api/live-tournaments/[id]` — waiting branch

**File:** `src/app/api/live-tournaments/[id]/route.ts`

The waiting branch currently does not look up the session. It must now:
1. Perform the same optional session lookup already done in the active/completed branch
2. Return `isCreator: tournament.created_by === session?.user?.id ?? false`
3. Return `userTeamName` (look up whether the current user is already in the tournament) — this fixes a pre-existing gap where the "LEAVE TOURNAMENT" button could incorrectly show for non-participants in the waiting lobby

Updated waiting branch response shape:
```ts
{
  id, name, status: "waiting", maxTeams,
  teamCount, teams,
  userTeamName,   // string | null — current user's team name if joined
  isCreator,      // boolean — true if current user created this tournament
}
```

The active/completed branch must also return `isCreator` (same lookup, already has session).

---

### 5. UI — Waiting Lobby button

**File:** `src/app/tournaments/[id]/page.tsx`

In the waiting lobby section, add a "FILL WITH BOTS" button:

- **Visible when**: `tournament.status === "waiting"` AND `tournament.isCreator === true` AND `(tournament.teamCount ?? 0) < tournament.maxTeams`
- **Note on creator + participant**: The button is visible regardless of whether the creator has joined as a team. A creator who hasn't joined will simply watch bots play each other — this is intentional and acceptable.
- **Position**: below the team list in the waiting lobby
- **Variant**: `PokeButton variant="primary"`
- **Loading state**: "FILLING..." while request is in flight
- **On success**: re-fetch tournament state — bracket renders automatically since that logic already exists
- **On error**: show inline error message using existing `error` state

#### Type update

Add to `TournamentState` interface:
```ts
isCreator?: boolean;
userTeamName?: string | null;  // already partially present, ensure it's in waiting branch too
```

---

### 6. Bot winners in tournament list

**File:** `src/lib/tournament-db.ts` — `getAllTournaments()`

`getAllTournaments` resolves winner names by querying the `"user"` table. A bot winner has a `userId` of `bot_<uuid>`, which will not exist in the user table, so `winner_name` will return `null`. This is acceptable — the tournament list will simply show no winner name for bot-won tournaments. No code change required, but this is a known limitation.

---

## Data Flow

```
Creator clicks "FILL WITH BOTS"
  → POST /api/live-tournaments/[id]/fill-bots
    → verify session + createdBy
    → begin transaction + advisory lock
    → re-check status === "waiting" and count < maxTeams
    → generate bot teams
    → joinTournament() × N (inside transaction)
    → startTournament() (inside transaction)
    → commit
  → response: { status: "active" }
  → client re-fetches GET /api/live-tournaments/[id]
  → bracket renders
```

---

## Error Handling

- All bot inserts use `joinTournament()` which has `onConflictDoNothing()` — safe against partial retries of the same bot userId
- Advisory lock + transaction prevents double-fill races and over-capacity inserts
- If the transaction fails mid-insert, no bots are committed and the tournament remains in "waiting" status
- `startTournament` is only called inside the transaction after verifying status is still "waiting"

---

## Testing Considerations

- Unit: bot name generator produces valid names, no duplicates within a batch
- Unit: bot roster generation always returns exactly 6 pokemon with correct slot labels
- Integration: `POST /fill-bots` returns 401 without session
- Integration: `POST /fill-bots` returns 403 for non-creator
- Integration: `POST /fill-bots` returns 400 for already-started tournament
- Integration: `POST /fill-bots` returns 400 for already-full tournament
- Integration: after fill-bots, tournament status becomes "active" and team count equals maxTeams
- Integration: concurrent fill-bots requests do not produce more teams than maxTeams
