import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getAllTournaments, createTournament } from "@/lib/tournament-db";

// GET /api/tournaments — Public list of recent tournaments (no auth required)
export async function GET() {
  const tournaments = await getAllTournaments(100);
  return NextResponse.json(tournaments);
}

// POST /api/tournaments — Any authenticated user can create a tournament
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: unknown; maxTeams?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { name, maxTeams } = body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
  }
  if (trimmedName.length > 100) {
    return NextResponse.json(
      { error: "Tournament name must be 100 characters or fewer" },
      { status: 400 }
    );
  }

  const size = Number(maxTeams);
  if (!Number.isInteger(size) || ![2, 4, 8, 16, 32].includes(size)) {
    return NextResponse.json(
      { error: "Team size must be 2, 4, 8, 16, or 32" },
      { status: 400 }
    );
  }

  const id = await createTournament({
    name: trimmedName,
    maxTeams: size,
    createdBy: user.id,
  });

  return NextResponse.json(
    { id, name: trimmedName, maxTeams: size, status: "waiting" },
    { status: 201 }
  );
}
