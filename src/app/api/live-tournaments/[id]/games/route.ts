// src/app/api/live-tournaments/[id]/games/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTournamentGames } from "@/lib/tournament-db";

// Public endpoint — no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const games = await getTournamentGames(id);
  return NextResponse.json(games);
}
