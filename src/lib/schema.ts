import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const rosters = pgTable("rosters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  city: text("city").notNull().default(""),
  isTournamentRoster: boolean("is_tournament_roster").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rosterPokemon = pgTable(
  "roster_pokemon",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rosterId: uuid("roster_id")
      .notNull()
      .references(() => rosters.id, { onDelete: "cascade" }),
    slotPosition: integer("slot_position").notNull(),
    slotLabel: text("slot_label").notNull(),
    pokemonId: integer("pokemon_id").notNull(),
    pokemonName: text("pokemon_name").notNull(),
    pokemonSprite: text("pokemon_sprite"),
    pokemonTypes: jsonb("pokemon_types").notNull().default([]),
    pokemonStats: jsonb("pokemon_stats").notNull().default({}),
    pokemonHeight: integer("pokemon_height"),
    pokemonWeight: integer("pokemon_weight"),
    pokemonTag: text("pokemon_tag"),
  },
  (t) => [unique().on(t.rosterId, t.slotPosition)]
);

export const liveTournaments = pgTable("live_tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Pokemon Tournament"),
  status: text("status").notNull().default("waiting"),
  maxTeams: integer("max_teams").notNull().default(8),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  bracketData: jsonb("bracket_data"),
  createdBy: text("created_by"),
});

export const liveTournamentTeams = pgTable(
  "live_tournament_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => liveTournaments.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    rosterId: text("roster_id").notNull(),
    teamName: text("team_name").notNull(),
    rosterData: jsonb("roster_data").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    result: text("result"),       // "champion" | "finalist" | "eliminated" | "in_progress" | "waiting"
    roundReached: integer("round_reached"), // 1-based. NULL until tournament starts.
  },
  (t) => [unique().on(t.tournamentId, t.userId)]
);

export const tournamentGames = pgTable(
  "tournament_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => liveTournaments.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    matchupIndex: integer("matchup_index").notNull(),
    team1UserId: text("team1_user_id"),
    team1Name: text("team1_name"),
    team2UserId: text("team2_user_id"),
    team2Name: text("team2_name"),
    team1Score: integer("team1_score"),
    team2Score: integer("team2_score"),
    winnerId: text("winner_id"),
    status: text("status").notNull().default("pending"), // "pending" | "in_progress" | "completed"
    startedAt: timestamp("started_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    playedAt: timestamp("played_at", { withTimezone: true }),
  },
  (t) => [index("tournament_games_tournament_id_idx").on(t.tournamentId)]
);

export const tournamentGameEvents = pgTable(
  "tournament_game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => tournamentGames.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tournament_game_events_game_seq_uniq").on(t.gameId, t.sequence),
    index("tournament_game_events_game_id_idx").on(t.gameId),
    index("tournament_game_events_game_seq_idx").on(t.gameId, t.sequence),
  ]
);

// ─── Season Mode ─────────────────────────────────────────────────────────────

export const seasons = pgTable("seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("registration"), // registration | active | playoffs | completed
  maxTeams: integer("max_teams").notNull().default(16),
  regularSeasonStart: timestamp("regular_season_start", { withTimezone: true }).notNull(),
  regularSeasonEnd: timestamp("regular_season_end", { withTimezone: true }).notNull(),
  playoffStart: timestamp("playoff_start", { withTimezone: true }).notNull(),
  playoffEnd: timestamp("playoff_end", { withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull(),
  registrationClosedAt: timestamp("registration_closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const seasonTeams = pgTable(
  "season_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    teamName: text("team_name").notNull(),
    rosterData: jsonb("roster_data").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    pointsFor: integer("points_for").notNull().default(0),
    pointsAgainst: integer("points_against").notNull().default(0),
    // waiting | in_progress | did_not_qualify | eliminated | finalist | champion
    result: text("result").notNull().default("waiting"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.seasonId, t.userId)]
);

export const seasonLockedPokemon = pgTable(
  "season_locked_pokemon",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    pokemonId: integer("pokemon_id").notNull(),
    lockedByUserId: text("locked_by_user_id").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Composite primary key enforces DB-level uniqueness
  (t) => [primaryKey({ columns: [t.seasonId, t.pokemonId] })]
);

export const seasonGames = pgTable(
  "season_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    gameType: text("game_type").notNull().default("regular"), // regular | playoff
    team1UserId: text("team1_user_id").notNull(),
    team1Name: text("team1_name").notNull(),
    team2UserId: text("team2_user_id").notNull(),
    team2Name: text("team2_name").notNull(),
    team1Score: integer("team1_score"),
    team2Score: integer("team2_score"),
    winnerId: text("winner_id"),
    status: text("status").notNull().default("pending"), // pending | in_progress | completed
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sweepNumber: integer("sweep_number"), // 1–7 for regular season; null for playoffs
    round: integer("round"), // playoffs: 1=QF, 2=SF, 3=Finals; null for regular
    matchupIndex: integer("matchup_index"), // playoffs only
  },
  (t) => [
    index("season_games_season_id_idx").on(t.seasonId),
    index("season_games_scheduled_at_idx").on(t.scheduledAt),
  ]
);

export const seasonGameEvents = pgTable(
  "season_game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => seasonGames.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Unique constraint (PostgreSQL auto-creates an index for it — no duplicate index needed)
    unique("season_game_events_game_seq_uniq").on(t.gameId, t.sequence),
    // Single-column index for SSE polling queries: WHERE gameId = ? AND sequence > ?
    index("season_game_events_game_id_idx").on(t.gameId),
  ]
);
