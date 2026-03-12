import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getAllTournaments, createTournament } from "@/lib/tournament-db";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

// GET /api/admin/tournaments — List all tournaments
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tournaments = await getAllTournaments(50);
  return NextResponse.json(tournaments);
}

// POST /api/admin/tournaments — Create a new tournament
export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, maxTeams } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
  }

  const size = Number(maxTeams);
  if (!Number.isInteger(size) || size < 2 || size % 2 !== 0) {
    return NextResponse.json(
      { error: "Team size must be an even number (minimum 2)" },
      { status: 400 }
    );
  }

  const id = await createTournament({
    name: name.trim(),
    maxTeams: size,
    createdBy: admin.id,
  });

  return NextResponse.json({ id, name: name.trim(), maxTeams: size, status: "waiting" }, { status: 201 });
}
