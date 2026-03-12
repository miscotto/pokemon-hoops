"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import RosterBuilder from "@/app/components/RosterBuilder";

export default function RosterBuilderPage() {
  const { id: rosterId } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [rosterName, setRosterName] = useState("");
  const [rosterCity, setRosterCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      router.replace("/dashboard");
      return;
    }

    fetch(`/api/rosters/${rosterId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || data.userId !== session.user.id) {
          setUnauthorized(true);
          return;
        }
        setRosterName(data.name || "Unnamed Roster");
        setRosterCity(data.city || "");
      })
      .catch(() => setUnauthorized(true))
      .finally(() => setLoading(false));
  }, [isPending, session, rosterId, router]);

  useEffect(() => {
    if (unauthorized) {
      router.replace("/dashboard");
    }
  }, [unauthorized, router]);

  if (isPending || loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div
          className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (unauthorized) {
    return null;
  }

  return (
    <RosterBuilder
      rosterId={rosterId}
      rosterName={rosterName}
      rosterCity={rosterCity}
      onBack={() => router.push("/dashboard")}
    />
  );
}
