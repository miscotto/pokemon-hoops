CREATE TABLE "tournament_game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_game_events_game_seq_uniq" UNIQUE("game_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "tournament_games" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_games" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_game_events" ADD CONSTRAINT "tournament_game_events_game_id_tournament_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."tournament_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_game_events_game_id_idx" ON "tournament_game_events" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "tournament_game_events_game_seq_idx" ON "tournament_game_events" USING btree ("game_id","sequence");--> statement-breakpoint
ALTER TABLE "tournament_games" DROP COLUMN "events";