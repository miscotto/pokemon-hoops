import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  unique,
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
  },
  (t) => [unique().on(t.tournamentId, t.userId)]
);
