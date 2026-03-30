CREATE TABLE "season_playoff_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"matchup_index" integer NOT NULL,
	"team1_user_id" text NOT NULL,
	"team1_name" text NOT NULL,
	"team2_user_id" text NOT NULL,
	"team2_name" text NOT NULL,
	"team1_wins" integer DEFAULT 0 NOT NULL,
	"team2_wins" integer DEFAULT 0 NOT NULL,
	"winner_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_games" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "season_games" ADD COLUMN "game_number_in_series" integer;--> statement-breakpoint
ALTER TABLE "season_playoff_series" ADD CONSTRAINT "season_playoff_series_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_playoff_series_season_id_idx" ON "season_playoff_series" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "season_playoff_series_season_round_idx" ON "season_playoff_series" USING btree ("season_id","round");--> statement-breakpoint
ALTER TABLE "season_games" ADD CONSTRAINT "season_games_series_id_season_playoff_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."season_playoff_series"("id") ON DELETE set null ON UPDATE no action;
