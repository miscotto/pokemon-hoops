import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import crypto from "crypto";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url").slice(0, 12);
}

// POST /api/admin/users/[id]/reset-password
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (id === admin.id) {
    return NextResponse.json({ error: "Cannot reset your own password" }, { status: 400 });
  }

  let targetUser: { id: string } | null = null;
  try {
    targetUser = await auth.api.getUser({ query: { id }, headers: await headers() });
  } catch {
    targetUser = null;
  }
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();

  try {
    await auth.api.setUserPassword({
      body: { newPassword: tempPassword, userId: id },
      headers: await headers(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }

  try {
    await auth.api.revokeUserSessions({
      body: { userId: id },
      headers: await headers(),
    });
  } catch {
    return NextResponse.json({ tempPassword, warning: "Sessions could not be revoked" });
  }

  return NextResponse.json({ tempPassword });
}
