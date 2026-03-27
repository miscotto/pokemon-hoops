"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import AuthForm from "../components/AuthForm";
import RosterDashboard from "../components/RosterDashboard";

// Hs

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="inline-block w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-full items-center justify-center">
        <AuthForm />
      </div>
    );
  }

  return (
    <RosterDashboard
      userName={session.user.name || session.user.email}
      onEditRoster={(rosterId) => router.push(`/rosters/${rosterId}/build`)}
      onJoinLiveTournament={(tournamentId) =>
        router.push(
          tournamentId ? `/tournaments/${tournamentId}` : "/tournaments"
        )
      }
    />
  );
}
