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
