# User Tournament Creation — Design Spec
**Date:** 2026-03-23

## Overview
Allow any authenticated user to create a tournament from the dashboard, not just admins.

## Backend

**Route:** `POST /api/tournaments` (added to existing `src/app/api/tournaments/route.ts`)

**Required imports to add to the route file:** `NextRequest` from `"next/server"`, `auth` from `"@/lib/auth"`, `headers` from `"next/headers"`, `createTournament` from `"@/lib/tournament-db"`.


- **Auth:** Requires a valid session (any role). Returns 401 if unauthenticated.
- **Request body:** `{ name: string, maxTeams: number }`
- **Validation:**
  - `name`: non-empty string (trimmed), max 100 characters. Error: `"Tournament name is required"` or `"Tournament name must be 100 characters or fewer"`.
  - `maxTeams`: coerced via `Number()`. Must satisfy `Number.isInteger(size) && [2, 4, 8, 16, 32].includes(size)`. This is stricter than the admin route (which allows any even integer ≥ 2) because the bracket engine computes rounds via `Math.floor(Math.log2(maxTeams))` — non-power-of-2 values produce broken brackets. Error: `"Team size must be 2, 4, 8, 16, or 32"`.
  - Malformed / missing JSON body: falls through to Next.js 500 handler (acceptable, same as admin route).
- **Success:** Trim `name` before passing to `createTournament`. Call `createTournament({ name: name.trim(), maxTeams: size, createdBy: user.id })` — this returns a plain `string` (the new tournament ID). Compose and return `{ id, name: name.trim(), maxTeams: size, status: "waiting" }` with HTTP 201. `name` and `maxTeams` are echoed from the validated/trimmed request input; no additional DB read is needed.
- **Error responses all use shape `{ error: string }`, matching existing API convention.**
- **Codes:** 400 for validation failures, 401 for missing/invalid session, 500 for unexpected DB errors (unhandled, delegated to Next.js).
- **Duplicate names:** Allowed. No uniqueness constraint on tournament names exists in the schema or `createTournament()`. Multiple tournaments with the same name can coexist.
- **Rate limiting / spam:** No per-user cap in this iteration. Intentionally deferred — tournaments fill up and auto-start, bounding their footprint. Revisit if abuse is observed.

No changes to `src/app/api/admin/tournaments/route.ts` — admin routes remain admin-only.

## Frontend

**Component:** `src/app/components/RosterDashboard.tsx`

Add a "Create Tournament" section below the existing "YOUR ROSTERS" section header row. UI mirrors the existing "Create Roster" pattern exactly:

- A "＋ NEW TOURNAMENT" button that sets `showCreateTournamentForm = true`. The button is hidden while the form is open (same pattern as the "＋ NEW ROSTER" button).
- A CANCEL button inside the form sets `showCreateTournamentForm = false` and resets all tournament form state (name → `""`, maxTeams → `8`, error → `""`)
- **Form fields:**
  - Tournament name: PokeInput text, placeholder "Tournament name"
  - Max teams: `<select>` (not a free-entry number input) with options 2/4/8/16/32, default 8. A select is used because the valid values are a fixed set — a free-entry input would allow users to type arbitrary values and hit a 400.
- **Submit button:** disabled while `creatingTournament === true` or while `newTournamentName.trim()` is empty. No additional client-side `maxTeams` validation needed — a `<select>` constrains the value to the valid set; shows "CREATING..." during submission (matches roster create pattern)
- The `fetch` call must include `headers: { "Content-Type": "application/json" }` (same as the existing `handleCreate` for rosters).
- On success: call `onJoinLiveTournament(id)`. The parent `dashboard/page.tsx` already routes `tournamentId ? /tournaments/${tournamentId} : "/tournaments"`, so passing the new `id` navigates to `/tournaments/<id>`. No parent changes needed.
- On success: the route guarantees a non-empty `id` string in the 201 response, so `onJoinLiveTournament(id)` is safe — no undefined-guard needed on the frontend.
- On error: set `tournamentCreateError` state (separate from the existing `error` state used by the roster form) and display inline with red pixel font, same visual pattern as roster create error. Reset `tournamentCreateError` on form open/cancel.
- No pending request cancellation on form close — if the user closes the form while a request is in flight, the request completes but the navigation is skipped (the component may be unmounted). This is acceptable for this feature.

**New state needed in `RosterDashboard`:**
- `showCreateTournamentForm: boolean` (default `false`)
- `newTournamentName: string` (default `""`)
- `newTournamentMaxTeams: number` (default `8`)
- `creatingTournament: boolean` (default `false`)
- `tournamentCreateError: string` (default `""`) — separate from the existing `error` state used by the roster create form, to avoid cross-contamination

## Data Flow

1. User clicks "＋ NEW TOURNAMENT" in dashboard
2. Inline form appears with name + maxTeams fields
3. User submits → `POST /api/tournaments` with `{ name, maxTeams }`
4. API validates (power-of-2 maxTeams, non-empty name ≤ 100 chars, auth check), creates tournament in DB with `createdBy = user.id`
5. Returns `{ id, name, maxTeams, status: "waiting" }`
6. Frontend calls `onJoinLiveTournament(id)` → navigates to `/tournaments/<id>`

## Out of Scope
- Tournament management (delete/cancel) by the creator
- Any role distinction between creator and other participants
- Rate limiting / per-user tournament creation cap
- Non-power-of-2 team sizes (bracket engine requires powers of 2)
