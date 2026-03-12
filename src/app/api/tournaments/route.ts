import { NextResponse } from "next/server";
import { getAllTournaments } from "@/lib/tournament-db";

// GET /api/tournaments — Public list of recent tournaments (no auth required)
export async function GET() {
  const tournaments = await getAllTournaments(100);
  return NextResponse.json(tournaments);
}
