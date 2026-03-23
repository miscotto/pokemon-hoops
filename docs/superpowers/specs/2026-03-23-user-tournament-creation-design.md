# User Tournament Creation — Design Spec
**Date:** 2026-03-23

## Overview
Allow any authenticated user to create a tournament from the dashboard, not just admins.

## Backend

**Route:** `POST /api/tournaments` (added to existing `src/app/api/tournaments/route.ts`)

- **Auth:** Requires a valid session (any role). Returns 401 if unauthenticated.
- **Request body:** `{ name: string, maxTeams: number }`
- **Validation:**
  - `name`: non-empty string (trimmed)
  - `maxTeams`: even integer ≥ 2
- **Success:** Calls existing `createTournament({ name, maxTeams, createdBy: user.id })`, returns `{ id, name, maxTeams, status: "waiting" }` with HTTP 201.
- **Errors:** 400 for validation failures, 401 for missing session.

No changes to `src/app/api/admin/tournaments/route.ts` — admin routes remain admin-only.

## Frontend

**Component:** `src/app/components/RosterDashboard.tsx`

Add a "Create Tournament" section below the existing roster section header. Includes:
- A "＋ NEW TOURNAMENT" button that toggles an inline form
- Form fields: tournament name (PokeInput text), max teams (PokeInput number or select: 2/4/8/16, default 8)
- Submit calls `POST /api/tournaments`
- On success: navigate to the new tournament via the existing `onJoinLiveTournament(id)` prop
- On error: display inline error message using the same pattern as the roster create error
- UI follows existing patterns: PokeInput, PokeButton, PokeCard, font-pixel classes

## Data Flow

1. User clicks "＋ NEW TOURNAMENT" in dashboard
2. Inline form appears with name + maxTeams fields
3. User submits → `POST /api/tournaments` with `{ name, maxTeams }`
4. API validates, creates tournament in DB with `createdBy = user.id`
5. Returns `{ id, name, maxTeams, status: "waiting" }`
6. Frontend navigates to `/tournaments/<id>`

## Out of Scope
- Tournament management (delete/cancel) by the creator
- Any role distinction between creator and other participants
