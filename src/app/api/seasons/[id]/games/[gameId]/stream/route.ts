import { NextRequest } from "next/server";
import { dbHttp } from "@/lib/db-http";
import { seasonGames, seasonGameEvents } from "@/lib/schema";
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

      // Load current game state
      const gameRows = await dbHttp
        .select({
          status: seasonGames.status,
          team1Score: seasonGames.team1Score,
          team2Score: seasonGames.team2Score,
          team1Name: seasonGames.team1Name,
          team2Name: seasonGames.team2Name,
          winnerId: seasonGames.winnerId,
          round: seasonGames.round,
          gameType: seasonGames.gameType,
        })
        .from(seasonGames)
        .where(eq(seasonGames.id, gameId));

      const game = gameRows[0];
      if (!game) { controller.close(); return; }

      send("game_state", {
        status: game.status,
        team1Score: game.team1Score ?? 0,
        team2Score: game.team2Score ?? 0,
        team1Name: game.team1Name,
        team2Name: game.team2Name,
        round: game.round,
        gameType: game.gameType,
      });

      // Burst existing events
      const existingEvents = await dbHttp
        .select()
        .from(seasonGameEvents)
        .where(eq(seasonGameEvents.gameId, gameId))
        .orderBy(asc(seasonGameEvents.sequence));

      for (const ev of existingEvents) {
        send("game_event", { ...(ev.data as object), sequence: ev.sequence });
      }

      let lastSequence = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1].sequence : -1;

      const hasGameEnd = existingEvents.some((e) => e.type === "game_end");
      if (hasGameEnd) {
        send("game_end", { team1Score: game.team1Score, team2Score: game.team2Score, winnerId: game.winnerId });
        controller.close();
        return;
      }

      // Poll for new events
      while (!req.signal.aborted) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (req.signal.aborted) break;

        const newEvents = await dbHttp
          .select()
          .from(seasonGameEvents)
          .where(and(eq(seasonGameEvents.gameId, gameId), gt(seasonGameEvents.sequence, lastSequence)))
          .orderBy(asc(seasonGameEvents.sequence));

        for (const ev of newEvents) {
          send("game_event", { ...(ev.data as object), sequence: ev.sequence });
          lastSequence = ev.sequence;

          if (ev.type === "game_end") {
            const finalRows = await dbHttp
              .select({ team1Score: seasonGames.team1Score, team2Score: seasonGames.team2Score, winnerId: seasonGames.winnerId })
              .from(seasonGames)
              .where(eq(seasonGames.id, gameId));
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
