# Pokémon Basketball — Project Summary

## Overview

A **Next.js** web app where users build rosters of Pokémon reimagined as basketball players, then enter an 8-team single-elimination tournament. Every Pokémon's base stats are converted into basketball averages (PPG, RPG, APG, etc.) and assigned an NBA-style salary, creating a salary-cap drafting game.

---

## What Was Built

### 1. Basketball Stat Conversion (`src/app/utils/bballStats.ts`)

- Maps the six Pokémon base stats → seven basketball averages (PPG, RPG, APG, SPG, BPG, MPG, PER).
- Physical attributes (height, weight) influence rebounds and blocks.
- NBA CBA–inspired salary formula ($1M–$44M) based on weighted stat composite.
- Playstyle archetype labels (e.g., "Floor General", "Double-Double Threat", "Lockdown Defender") derived from stat thresholds.
- **Salary cap**: $160M for a team of 6.

### 2. Pre-computed Dataset (`scripts/buildAllStats.ts` → `public/pokemon-bball-stats.json`)

- Fetches all 1,025 Pokémon from PokeAPI, computes basketball averages + salary + playstyle for each.
- Writes the full dataset as a static JSON file served from `/public`.

### 3. Ball Handler / Support Classification (`scripts/classifyPositions.ts`)

- Uses **OpenAI Batch API with GPT-4o-mini vision** to look at each Pokémon's sprite and classify it as:
  - **Ball handler** — has arms, wings, or a large tail (can dribble).
  - **Support** — blobs, fish, snakes without arms, rocks, etc.
- Results written to `public/pokemon-positions.json`, then merged into the main stats JSON.

### 4. Support Abilities System (`src/app/utils/supportAbilities.ts`)

- Support Pokémon receive a **special ability** instead of a basketball playstyle, determined by their dominant base stat:
  - **HP** → Regenerator / Helping Hand
  - **Attack** → Intimidate / Pressure
  - **Defense** → Sturdy / Screen Cleaner
  - **Sp. Atk** → Battery / Telepathy
  - **Sp. Def** → Friend Guard / Aroma Veil
  - **Speed** → Quick Draw / Prankster
- Each ability has **concrete tournament effects**: team power boosts, opponent debuffs, injury/fatigue reduction, cold streak protection.
- Stacking is capped to prevent all-support teams from being overpowered.
- A **support overload penalty** punishes teams with too many support Pokémon (>3).

### 5. Tournament Engine (`src/app/utils/tournamentEngine.ts`)

- 8-team single-elimination bracket (Quarterfinals → Semifinals → Finals).
- 7 AI opponents generated from themed templates (e.g., "Blaze Battalion", "Shadow Syndicate") with strategy-specific drafting.
- Match simulation considers:
  - **Team power** (weighted stat composite)
  - **Type advantages** (full 18×18 type chart)
  - **Chemistry** (type diversity + handler/support role balance)
  - **Size matchups** (height/weight averages)
  - **Support ability effects** (aggregated from all support Pokémon)
  - **Randomness** (injuries, hot hands, cold streaks, clutch plays, fatigue)
- Quarter-by-quarter scoring with narrative highlight events (dunks, blocks, steals, three-pointers).

### 6. Roster Builder UI (`src/app/components/RosterBuilder.tsx`)

- Drag-and-drop interface for filling 5 positions (PG, SG, SF, PF, C) + 6th man reserve.
- Pokémon browser with search, type filter, and sort (by ID, name, or stats).
- Salary cap tracker — shows remaining cap space in real time.
- Persists rosters to database via API.

### 7. Authentication & Database

- **Better Auth** integration (`src/lib/auth.ts`, `src/lib/auth-client.ts`) for user sign-up/login.
- **Neon Postgres** database (`src/lib/db.ts`) storing users, rosters, and roster Pokémon.
- API routes under `src/app/api/` for CRUD on rosters and tournament simulation.

### 8. Tournament UI (`src/app/components/TournamentView.tsx`)

- Bracket visualization with animated round reveals.
- Match detail view showing quarter-by-quarter scores, highlight events, and game factors.
- Full 1,025-Pokémon pool loaded from the static JSON for AI team generation.

---

## Data Pipeline

```
PokeAPI (1,025 Pokémon)
  │
  ▼
buildAllStats.ts ──→ pokemon-bball-stats.json (stats + salary + playstyle)
  │
  ▼
classifyPositions.ts ──→ pokemon-positions.json (ball handler / support tags via GPT-4o-mini vision)
  │
  ▼
buildAllStats.ts (re-run) ──→ pokemon-bball-stats.json (now includes tag + ability fields)
```

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Auth**: Better Auth
- **Database**: Neon Postgres
- **AI**: OpenAI Batch API (GPT-4o-mini vision) for sprite classification
- **Data Source**: PokeAPI
