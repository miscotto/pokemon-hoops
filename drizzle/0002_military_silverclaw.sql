CREATE TABLE "season_game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_game_events_game_seq_uniq" UNIQUE("game_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "season_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"game_type" text DEFAULT 'regular' NOT NULL,
	"team1_user_id" text NOT NULL,
	"team1_name" text NOT NULL,
	"team2_user_id" text NOT NULL,
	"team2_name" text NOT NULL,
	"team1_score" integer,
	"team2_score" integer,
	"winner_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"sweep_number" integer,
	"round" integer,
	"matchup_index" integer
);
--> statement-breakpoint
CREATE TABLE "season_locked_pokemon" (
	"season_id" uuid NOT NULL,
	"pokemon_id" integer NOT NULL,
	"locked_by_user_id" text NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_locked_pokemon_season_id_pokemon_id_pk" PRIMARY KEY("season_id","pokemon_id")
);
--> statement-breakpoint
CREATE TABLE "season_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"team_name" text NOT NULL,
	"roster_data" jsonb NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"points_for" integer DEFAULT 0 NOT NULL,
	"points_against" integer DEFAULT 0 NOT NULL,
	"result" text DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_teams_season_id_user_id_unique" UNIQUE("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'registration' NOT NULL,
	"max_teams" integer DEFAULT 16 NOT NULL,
	"regular_season_start" timestamp with time zone NOT NULL,
	"regular_season_end" timestamp with time zone NOT NULL,
	"playoff_start" timestamp with time zone NOT NULL,
	"playoff_end" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"registration_closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_game_events" ADD CONSTRAINT "season_game_events_game_id_season_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."season_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_locked_pokemon" ADD CONSTRAINT "season_locked_pokemon_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_teams" ADD CONSTRAINT "season_teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_game_events_game_id_idx" ON "season_game_events" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "season_games_season_id_idx" ON "season_games" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_games_scheduled_at_idx" ON "season_games" USING btree ("scheduled_at");