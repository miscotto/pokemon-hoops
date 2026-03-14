import { NextRequest } from "next/server";
import { dbHttp } from "@/lib/db-http";
import { tournamentGames, tournamentGameEvents } from "@/lib/schema";
import { eq, and, gt, asc } from "drizzle-orm";

export const maxDuration = 800;

const POLL_INTERVAL_MS = 500;

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  const { gameId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseMessage(event, data)));
      };

      // 1. Load current game state
      const gameRows = await dbHttp
        .select({
          status: tournamentGames.status,
          team1Score: tournamentGames.team1Score,
          team2Score: tournamentGames.team2Score,
          team1Name: tournamentGames.team1Name,
          team2Name: tournamentGames.team2Name,
          winnerId: tournamentGames.winnerId,
          round: tournamentGames.round,
        })
        .from(tournamentGames)
        .where(eq(tournamentGames.id, gameId));

      const game = gameRows[0];
      if (!game) {
        controller.close();
        return;
      }

      // 2. Send initial game_state
      send("game_state", {
        status: game.status,
        team1Score: game.team1Score ?? 0,
        team2Score: game.team2Score ?? 0,
        team1Name: game.team1Name,
        team2Name: game.team2Name,
        round: game.round,
      });

      // 3. Burst all existing events
      const existingEvents = await dbHttp
        .select()
        .from(tournamentGameEvents)
        .where(eq(tournamentGameEvents.gameId, gameId))
        .orderBy(asc(tournamentGameEvents.sequence));

      for (const ev of existingEvents) {
        // Inject row-level sequence into payload so frontend can deduplicate on reconnect
        send("game_event", { ...(ev.data as object), sequence: ev.sequence });
      }

      let lastSequence = existingEvents.length > 0
        ? existingEvents[existingEvents.length - 1].sequence
        : -1;

      // If game already completed and game_end was in the burst, close
      const hasGameEnd = existingEvents.some((e) => e.type === "game_end");
      if (hasGameEnd) {
        send("game_end", {
          team1Score: game.team1Score,
          team2Score: game.team2Score,
          winnerId: game.winnerId,
        });
        controller.close();
        return;
      }

      // 4. Poll for new events
      while (!req.signal.aborted) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (req.signal.aborted) break;

        const newEvents = await dbHttp
          .select()
          .from(tournamentGameEvents)
          .where(
            and(
              eq(tournamentGameEvents.gameId, gameId),
              gt(tournamentGameEvents.sequence, lastSequence)
            )
          )
          .orderBy(asc(tournamentGameEvents.sequence));

        for (const ev of newEvents) {
          send("game_event", { ...(ev.data as object), sequence: ev.sequence });
          lastSequence = ev.sequence;

          if (ev.type === "game_end") {
            // Fetch final scores from game row
            const finalRows = await dbHttp
              .select({ team1Score: tournamentGames.team1Score, team2Score: tournamentGames.team2Score, winnerId: tournamentGames.winnerId })
              .from(tournamentGames)
              .where(eq(tournamentGames.id, gameId));
            send("game_end", finalRows[0] ?? {});
            controller.close();
            return;
          }
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
