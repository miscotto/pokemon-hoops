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
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return <AuthForm />;
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
