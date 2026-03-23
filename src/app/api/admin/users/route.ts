import { NextResponse } from "next/server";
import { headers } from "next/headers";

async function getAdminUser() {
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

// GET /api/admin/users — List all users (admin only)
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { auth } = await import("@/lib/auth");
  const result = await auth.api.listUsers({
    headers: await headers(),
    query: { limit: 100 },
  });

  return NextResponse.json(result.users);
}
