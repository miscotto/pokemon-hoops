import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { leaveTournament } from "@/lib/tournament-db";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await leaveTournament(id, user.id);

  if (result === "left") {
    return NextResponse.json({ left: true });
  }
  if (result === "already_started") {
    return NextResponse.json({ error: "Tournament already started" }, { status: 400 });
  }
  return NextResponse.json({ error: "Not in tournament" }, { status: 400 });
}
